use std::sync::{Arc, OnceLock};

use aperture_engine::embedding::EmbeddingClient;
use aperture_engine::engine::Engine;
use aperture_engine::error::{EngineError, Result};
use aperture_engine::llm::{LlmClient, LlmMessage, LlmResponse};
use aperture_engine::prompt::{Prompt, PromptOutput};
use aperture_engine::prompt_runner::PromptRunner;
use aperture_engine::tool::Tool;
use aperture_runtime::{
    AgentsMdPlugin, AuthPlugin, BehaviourPlugin, CliPlugin, ConversationPlugin, DatabasePlugin,
    FilesystemPlugin, RuntimeConfig, RuntimeConfigPlugin,
};
use aperture_sandbox_code::{QuickJsSandbox, SandboxPlugin};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::config::ServerConfig;

// ── OpenAI wire types (shared with playground) ───────────────────────

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<ChatTool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ChatToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize)]
struct ChatTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: ChatFunction,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: ChatFunctionCall,
}

#[derive(Serialize)]
struct ChatFunction {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
    usage: Option<ChatUsage>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

// ── OpenAI LLM client ───────────────────────────────────────────────

struct OpenAiClient {
    api_key: String,
    base_url: String,
    model: String,
    http: reqwest::Client,
}

impl OpenAiClient {
    fn new(api_key: String, base_url: String, model: String) -> Self {
        Self {
            api_key,
            base_url,
            model,
            http: reqwest::Client::new(),
        }
    }

    fn engine_to_chat_messages(&self, messages: &[LlmMessage]) -> Vec<ChatMessage> {
        let mut chat_msgs: Vec<ChatMessage> = Vec::new();
        for msg in messages {
            match msg {
                LlmMessage::System(text) => chat_msgs.push(ChatMessage {
                    role: "system".into(),
                    content: Some(text.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                }),
                LlmMessage::User(text) => chat_msgs.push(ChatMessage {
                    role: "user".into(),
                    content: Some(text.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                }),
                LlmMessage::Assistant(text) => chat_msgs.push(ChatMessage {
                    role: "assistant".into(),
                    content: Some(text.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                }),
                LlmMessage::ToolCall { tool_id, input } => {
                    let call = ChatToolCall {
                        id: tool_id.clone(),
                        call_type: "function".into(),
                        function: ChatFunctionCall {
                            name: tool_id.clone(),
                            arguments: serde_json::to_string(input).unwrap_or_default(),
                        },
                    };
                    if let Some(last) = chat_msgs.last_mut() {
                        if last.role == "assistant" && last.content.is_none() {
                            last.tool_calls.get_or_insert_with(Vec::new).push(call);
                            continue;
                        }
                    }
                    chat_msgs.push(ChatMessage {
                        role: "assistant".into(),
                        content: None,
                        tool_calls: Some(vec![call]),
                        tool_call_id: None,
                    });
                }
                LlmMessage::ToolResponse { tool_id, output } => {
                    chat_msgs.push(ChatMessage {
                        role: "tool".into(),
                        content: Some(serde_json::to_string(output).unwrap_or_default()),
                        tool_calls: None,
                        tool_call_id: Some(tool_id.clone()),
                    });
                }
            }
        }
        chat_msgs
    }

    fn tools_to_chat_tools(&self, tools: &[&Tool]) -> Vec<ChatTool> {
        tools
            .iter()
            .map(|t| ChatTool {
                tool_type: "function".into(),
                function: ChatFunction {
                    name: t.id.clone(),
                    description: t.description.clone(),
                    parameters: t.input_schema.clone(),
                },
            })
            .collect()
    }
}

#[async_trait]
impl LlmClient for OpenAiClient {
    async fn call(&self, messages: &[LlmMessage], tools: &[&Tool]) -> Result<LlmResponse> {
        let request = ChatRequest {
            model: self.model.clone(),
            messages: self.engine_to_chat_messages(messages),
            tools: self.tools_to_chat_tools(tools),
        };

        let url = format!("{}/chat/completions", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&request)
            .send()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("HTTP error: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_else(|_| "no body".into());
            return Err(EngineError::ToolInvocation(format!(
                "OpenAI API error {status}: {body}"
            )));
        }

        let chat_resp: ChatResponse = resp
            .json()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("JSON decode error: {e}")))?;

        let choice = chat_resp
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| EngineError::ToolInvocation("no choices in response".into()))?;

        let mut outputs = Vec::new();

        if let Some(content) = &choice.message.content {
            if !content.is_empty() {
                outputs.push(PromptOutput::Text {
                    content: content.clone(),
                });
            }
        }

        if let Some(tool_calls) = choice.message.tool_calls {
            for call in tool_calls {
                let input: Value =
                    serde_json::from_str(&call.function.arguments).unwrap_or(json!({}));
                outputs.push(PromptOutput::Tool {
                    tool_id: call.function.name,
                    input,
                    result: None,
                });
            }
        }

        let usage = chat_resp.usage.unwrap_or(ChatUsage {
            prompt_tokens: 0,
            completion_tokens: 0,
        });

        Ok(LlmResponse {
            outputs,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
        })
    }
}

// ── OpenAI embedding client ─────────────────────────────────────────

struct OpenAiEmbeddingClient {
    api_key: String,
    base_url: String,
    model: String,
    http: reqwest::Client,
}

impl OpenAiEmbeddingClient {
    fn new(api_key: String, base_url: String, model: String) -> Self {
        Self {
            api_key,
            base_url,
            model,
            http: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
    index: usize,
}

#[async_trait]
impl EmbeddingClient for OpenAiEmbeddingClient {
    fn model_id(&self) -> &str {
        &self.model
    }

    async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        let request = EmbeddingRequest {
            model: self.model.clone(),
            input: texts.iter().map(|s| s.to_string()).collect(),
        };

        let url = format!("{}/embeddings", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&request)
            .send()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("embedding HTTP error: {e}")))?;

        if resp.status().as_u16() == 404 {
            return Err(EngineError::EmbeddingUnavailable);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_else(|_| "no body".into());
            return Err(EngineError::ToolInvocation(format!(
                "embedding API error {status}: {body}"
            )));
        }

        let emb_resp: EmbeddingResponse = resp
            .json()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("embedding JSON error: {e}")))?;

        let mut sorted = emb_resp.data;
        sorted.sort_by_key(|d| d.index);
        Ok(sorted.into_iter().map(|d| d.embedding).collect())
    }
}

// ── Engine handle for deferred Arc ───────────────────────────────────

struct EngineHandle(OnceLock<Arc<Engine>>);

struct ServerPromptRunner {
    llm: Arc<dyn LlmClient>,
    handle: Arc<EngineHandle>,
}

#[async_trait]
impl PromptRunner for ServerPromptRunner {
    async fn run(&self, user_id: &str, input: &str, history: &[Prompt]) -> Result<Prompt> {
        let engine = self
            .handle
            .0
            .get()
            .expect("engine handle must be set before use");
        engine.run(&*self.llm, user_id, input, history).await
    }
}

// ── Build engine ─────────────────────────────────────────────────────

pub async fn build_engine(config: &ServerConfig) -> Result<Arc<Engine>> {
    let mut engine = Engine::new();

    // Register plugins.
    engine
        .register(Box::new(RuntimeConfigPlugin::new(RuntimeConfig::default())))
        .await?;
    engine.register(Box::new(DatabasePlugin)).await?;
    engine.register(Box::new(AuthPlugin)).await?;
    engine.register(Box::new(ConversationPlugin)).await?;
    engine.register(Box::new(FilesystemPlugin)).await?;
    engine.register(Box::new(CliPlugin)).await?;
    engine.register(Box::new(AgentsMdPlugin)).await?;
    engine.register(Box::new(BehaviourPlugin)).await?;

    let sandbox = Arc::new(QuickJsSandbox::new());
    engine
        .register(Box::new(SandboxPlugin::new(sandbox)))
        .await?;

    // Register prompt event schemas.
    engine
        .events()
        .register_event_schema(
            "prompt.created",
            json!({"type": "object", "description": "Fired when a prompt starts executing"}),
        )
        .await;
    engine
        .events()
        .register_event_schema(
            "prompt.updated",
            json!({"type": "object", "description": "Fired when prompt output changes"}),
        )
        .await;
    engine
        .events()
        .register_event_schema(
            "prompt.completed",
            json!({"type": "object", "description": "Fired when a prompt finishes"}),
        )
        .await;
    engine
        .events()
        .register_event_schema(
            "prompt.waiting_for_approval",
            json!({"type": "object", "description": "Fired when a prompt needs approval"}),
        )
        .await;

    // Build PromptRunner with deferred engine handle.
    let handle = Arc::new(EngineHandle(OnceLock::new()));
    let llm: Arc<dyn LlmClient> = Arc::new(OpenAiClient::new(
        config.openai_api_key.clone(),
        config.openai_base_url.clone(),
        config.openai_model.clone(),
    ));

    let runner: Arc<dyn PromptRunner> = Arc::new(ServerPromptRunner {
        llm,
        handle: handle.clone(),
    });
    engine.insert_extension(runner);

    // Embedding client for behaviour matching.
    let embedding_client: Arc<dyn EmbeddingClient> = Arc::new(OpenAiEmbeddingClient::new(
        config.openai_api_key.clone(),
        config.openai_base_url.clone(),
        config.openai_embedding_model.clone(),
    ));
    engine.insert_extension(embedding_client);

    let engine = Arc::new(engine);
    handle
        .0
        .set(engine.clone())
        .ok()
        .expect("handle already set");

    Ok(engine)
}
