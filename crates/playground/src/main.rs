use std::sync::Arc;

use aperture_engine::{
    engine::{Engine, LlmClient, LlmMessage, LlmResponse},
    error::{EngineError, Result},
    prompt::{PromptOutput, PromptState, ToolResult},
    tool::{Tool, ToolContext, ToolInvoke},
};
use aperture_runtime::{CliPlugin, FilesystemPlugin, RuntimeConfig, RuntimeConfigPlugin};
use aperture_sandbox_code::{QuickJsSandbox, SandboxPlugin};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// ── OpenAI wire types ──────────────────────────────────────────────

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

// ── OpenAI LLM client ─────────────────────────────────────────────

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
                LlmMessage::System(text) => {
                    chat_msgs.push(ChatMessage {
                        role: "system".into(),
                        content: Some(text.clone()),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                LlmMessage::User(text) => {
                    chat_msgs.push(ChatMessage {
                        role: "user".into(),
                        content: Some(text.clone()),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                LlmMessage::Assistant(text) => {
                    chat_msgs.push(ChatMessage {
                        role: "assistant".into(),
                        content: Some(text.clone()),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
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
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "no body".to_string());
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

// ── Example plugins ────────────────────────────────────────────────

struct EchoPlugin;

struct EchoToolImpl;

#[async_trait]
impl ToolInvoke for EchoToolImpl {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let text = ctx.input.get("text").and_then(|v| v.as_str()).unwrap_or("");
        Ok(json!({"echoed": text}))
    }
}

#[async_trait]
impl aperture_engine::Plugin for EchoPlugin {
    fn id(&self) -> &str {
        "echo"
    }
    fn description(&self) -> &str {
        "Echoes input text back"
    }

    async fn prepare(&self, ctx: &mut aperture_engine::PrepareContext<'_>) -> Result<()> {
        ctx.tools.push(Tool {
            id: "echo".into(),
            description: "Echoes the input text back unchanged. Use when asked to repeat something."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "The text to echo" }
                },
                "required": ["text"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Box::new(EchoToolImpl),
        });
        Ok(())
    }
}

struct DateTimePlugin;

struct DateTimeToolImpl;

#[async_trait]
impl ToolInvoke for DateTimeToolImpl {
    async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Ok(json!(now))
    }
}

#[async_trait]
impl aperture_engine::Plugin for DateTimePlugin {
    fn id(&self) -> &str {
        "datetime"
    }
    fn description(&self) -> &str {
        "Provides the current date and time"
    }

    async fn prepare(&self, ctx: &mut aperture_engine::PrepareContext<'_>) -> Result<()> {
        ctx.tools.push(Tool {
            id: "get_current_time".into(),
            description:
                "Returns the current Unix timestamp. Use when asked about the current time or date."
                    .into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: None,
            invoke: Box::new(DateTimeToolImpl),
        });
        Ok(())
    }
}

// ── CLI ─────────────────────────────────────────────────────────────

const USAGE: &str = "\
Usage: aperture-playground [OPTIONS] [PROMPT]

Run a single prompt through the Aperture agent and print the result.
If PROMPT is omitted, reads from stdin.

Options:
  --user <ID>     User ID (default: playground-user)
  --json          Output as JSON for programmatic consumption
  --help          Print this help message

Environment:
  OPENAI_API_KEY     Required. API key for the LLM provider.
  OPENAI_BASE_URL    Base URL (default: https://api.openai.com/v1)
  OPENAI_MODEL       Model name (default: gpt-4o)";

struct Args {
    user_id: String,
    json_output: bool,
    prompt: String,
}

fn parse_args() -> std::result::Result<Args, String> {
    let mut args = std::env::args().skip(1).peekable();
    let mut user_id = "playground-user".to_string();
    let mut json_output = false;
    let mut positional = Vec::new();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                println!("{USAGE}");
                std::process::exit(0);
            }
            "--json" => json_output = true,
            "--user" => {
                user_id = args
                    .next()
                    .ok_or_else(|| "--user requires a value".to_string())?;
            }
            other if other.starts_with('-') => {
                return Err(format!("unknown option: {other}"));
            }
            _ => positional.push(arg),
        }
    }

    let prompt = if positional.is_empty() {
        // Read from stdin.
        use std::io::Read;
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .map_err(|e| format!("failed to read stdin: {e}"))?;
        buf.trim().to_string()
    } else {
        positional.join(" ")
    };

    if prompt.is_empty() {
        return Err("no prompt provided".to_string());
    }

    Ok(Args {
        user_id,
        json_output,
        prompt,
    })
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("error: {e}\n");
            eprintln!("{USAGE}");
            std::process::exit(2);
        }
    };

    let api_key = match std::env::var("OPENAI_API_KEY") {
        Ok(k) => k,
        Err(_) => {
            eprintln!("error: OPENAI_API_KEY must be set");
            std::process::exit(2);
        }
    };
    let base_url =
        std::env::var("OPENAI_BASE_URL").unwrap_or_else(|_| "https://api.openai.com/v1".into());
    let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o".into());

    let llm = OpenAiClient::new(api_key, base_url, model);

    let mut engine = Engine::new();

    engine
        .register(Box::new(RuntimeConfigPlugin::new(RuntimeConfig::default())))
        .await
        .expect("failed to register RuntimeConfigPlugin");
    engine
        .register(Box::new(FilesystemPlugin))
        .await
        .expect("failed to register FilesystemPlugin");
    engine
        .register(Box::new(CliPlugin))
        .await
        .expect("failed to register CliPlugin");
    engine
        .register(Box::new(EchoPlugin))
        .await
        .expect("failed to register EchoPlugin");
    engine
        .register(Box::new(DateTimePlugin))
        .await
        .expect("failed to register DateTimePlugin");

    let sandbox = Arc::new(QuickJsSandbox::new());
    engine
        .register(Box::new(SandboxPlugin::new(sandbox)))
        .await
        .expect("failed to register SandboxPlugin");

    match engine.run(&llm, &args.user_id, &args.prompt, &[]).await {
        Ok(prompt) => {
            if args.json_output {
                print_json(&prompt);
            } else {
                print_human(&prompt);
            }

            if prompt.state == PromptState::WaitingForApproval {
                std::process::exit(3);
            }
        }
        Err(e) => {
            if args.json_output {
                let out = json!({ "error": e.to_string() });
                println!("{}", serde_json::to_string_pretty(&out).unwrap());
            } else {
                eprintln!("error: {e}");
            }
            std::process::exit(1);
        }
    }
}

fn print_human(prompt: &aperture_engine::prompt::Prompt) {
    for output in &prompt.output {
        match output {
            PromptOutput::Text { content } => {
                println!("{content}");
            }
            PromptOutput::Tool {
                tool_id,
                input,
                result,
            } => {
                eprintln!("[tool: {tool_id}]");
                eprintln!("  input:  {input}");
                if let Some(result) = result {
                    match result {
                        ToolResult::Success { output } => {
                            eprintln!("  result: {output}");
                        }
                        ToolResult::Error { error } => {
                            eprintln!("  error:  {error}");
                        }
                        ToolResult::Pending { reason, .. } => {
                            eprintln!("  pending: {reason}");
                        }
                    }
                }
            }
            PromptOutput::File { path, content } => {
                eprintln!("[file: {path}]");
                eprintln!("  {content}");
            }
        }
    }

    if prompt.state == PromptState::WaitingForApproval {
        eprintln!("(paused — waiting for approval)");
    }

    eprintln!(
        "tokens: {} prompt + {} completion = {} total",
        prompt.usage.prompt_tokens, prompt.usage.completion_tokens, prompt.usage.total_tokens,
    );
}

fn print_json(prompt: &aperture_engine::prompt::Prompt) {
    let outputs: Vec<Value> = prompt
        .output
        .iter()
        .map(|o| match o {
            PromptOutput::Text { content } => {
                json!({ "type": "text", "content": content })
            }
            PromptOutput::Tool {
                tool_id,
                input,
                result,
            } => {
                let result_val = match result {
                    Some(ToolResult::Success { output }) => {
                        json!({ "status": "success", "output": output })
                    }
                    Some(ToolResult::Error { error }) => {
                        json!({ "status": "error", "error": error })
                    }
                    Some(ToolResult::Pending { reason, .. }) => {
                        json!({ "status": "pending", "reason": reason })
                    }
                    None => Value::Null,
                };
                json!({
                    "type": "tool",
                    "tool_id": tool_id,
                    "input": input,
                    "result": result_val,
                })
            }
            PromptOutput::File { path, content } => {
                json!({ "type": "file", "path": path, "content": content })
            }
        })
        .collect();

    let out = json!({
        "state": format!("{:?}", prompt.state),
        "outputs": outputs,
        "usage": {
            "prompt_tokens": prompt.usage.prompt_tokens,
            "completion_tokens": prompt.usage.completion_tokens,
            "total_tokens": prompt.usage.total_tokens,
        },
    });

    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}
