use async_trait::async_trait;
use serde_json::json;

use aperture_engine::action::Action;
use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, SetupContext};
use aperture_engine::prompt::Prompt;
use aperture_engine::prompt_events::{PROMPT_COMPLETED, PROMPT_CREATED, PROMPT_UPDATED};

use crate::conversation_actions;
use crate::conversation_db;
use crate::conversation_events::{CONVERSATION_CREATED, CONVERSATION_PROMPT_ATTACHED};
use crate::db_plugin::DatabaseService;

pub struct ConversationPlugin;

#[async_trait]
impl Plugin for ConversationPlugin {
    fn id(&self) -> &str {
        "conversation"
    }

    fn description(&self) -> &str {
        "Manages conversations and persists prompts to SQLite"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        // 1. Run migrations.
        let db = ctx
            .extensions
            .get::<DatabaseService>()
            .ok_or_else(|| EngineError::PluginSetup("DatabaseService not found".into()))?
            .clone();

        db.call(conversation_db::migrate).await?;

        // 2. Register conversation events.
        ctx.events.register_event(&CONVERSATION_CREATED).await;
        ctx.events
            .register_event(&CONVERSATION_PROMPT_ATTACHED)
            .await;

        // 3. Subscribe to prompt events and persist to DB.
        let db_for_listener = db.clone();
        let mut rx_created = ctx.events.subscribe::<Prompt>(&PROMPT_CREATED).await;
        let mut rx_updated = ctx.events.subscribe::<Prompt>(&PROMPT_UPDATED).await;
        let mut rx_completed = ctx.events.subscribe::<Prompt>(&PROMPT_COMPLETED).await;

        tokio::spawn(async move {
            loop {
                let prompt: Option<Prompt> = tokio::select! {
                    Ok(val) = rx_created.recv() => serde_json::from_value(val).ok(),
                    Ok(val) = rx_updated.recv() => serde_json::from_value(val).ok(),
                    Ok(val) = rx_completed.recv() => serde_json::from_value(val).ok(),
                    else => break,
                };

                if let Some(prompt) = prompt {
                    let id = prompt.id.clone();
                    let user_id = prompt.user_id.clone();
                    let state = conversation_db::state_to_str(&prompt.state).to_string();
                    let input = prompt.input.clone();
                    let output_json = serde_json::to_string(&prompt.output).unwrap_or_default();
                    let usage_json = serde_json::to_string(&prompt.usage).unwrap_or_default();

                    let _ = db_for_listener
                        .call(move |conn| {
                            conversation_db::upsert_prompt(
                                conn,
                                &id,
                                &user_id,
                                &state,
                                input.as_deref(),
                                &output_json,
                                &usage_json,
                            )
                        })
                        .await;
                }
            }
        });

        // 4. Register actions.
        ctx.actions.push(Action {
            id: "create_conversation".into(),
            description: "Create a new conversation".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"}
                }
            }),
            output_schema: None,
            invoke: Box::new(conversation_actions::CreateConversation),
        });

        ctx.actions.push(Action {
            id: "list_conversations".into(),
            description: "List conversations for the current user".into(),
            input_schema: json!({"type": "object"}),
            output_schema: None,
            invoke: Box::new(conversation_actions::ListConversations),
        });

        ctx.actions.push(Action {
            id: "get_conversation".into(),
            description: "Get a conversation and its prompts".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "conversation_id": {"type": "string"}
                },
                "required": ["conversation_id"]
            }),
            output_schema: None,
            invoke: Box::new(conversation_actions::GetConversation),
        });

        ctx.actions.push(Action {
            id: "send_message".into(),
            description: "Send a message in a conversation".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "conversation_id": {"type": "string"},
                    "message": {"type": "string"}
                },
                "required": ["conversation_id", "message"]
            }),
            output_schema: None,
            invoke: Box::new(conversation_actions::SendMessage),
        });

        ctx.actions.push(Action {
            id: "attach_prompt".into(),
            description: "Attach an existing prompt to a conversation".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "conversation_id": {"type": "string"},
                    "prompt_id": {"type": "string"}
                },
                "required": ["conversation_id", "prompt_id"]
            }),
            output_schema: None,
            invoke: Box::new(conversation_actions::AttachPrompt),
        });

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::engine::{Engine, LlmClient, LlmMessage, LlmResponse};
    use aperture_engine::prompt::{PromptOutput, PromptState};
    use aperture_engine::prompt_runner::PromptRunner;
    use aperture_engine::tool::Tool;
    use rusqlite::Connection;

    struct InMemoryDbPlugin;

    #[async_trait]
    impl Plugin for InMemoryDbPlugin {
        fn id(&self) -> &str {
            "test-db"
        }
        async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
            let conn = Connection::open_in_memory()
                .map_err(|e| EngineError::PluginSetup(format!("open: {e}")))?;
            conn.execute_batch("PRAGMA journal_mode=WAL;")
                .map_err(|e| EngineError::PluginSetup(format!("wal: {e}")))?;
            ctx.extensions.insert(DatabaseService::new(conn));
            Ok(())
        }
    }

    struct MockLlm;

    #[async_trait]
    impl LlmClient for MockLlm {
        async fn call(&self, _messages: &[LlmMessage], _tools: &[&Tool]) -> Result<LlmResponse> {
            Ok(LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "mock response".into(),
                }],
                prompt_tokens: 5,
                completion_tokens: 3,
            })
        }
    }

    struct MockPromptRunner;

    #[async_trait]
    impl PromptRunner for MockPromptRunner {
        async fn run(
            &self,
            user_id: &str,
            input: &str,
            _history: &[Prompt],
        ) -> Result<Prompt> {
            Ok(Prompt {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user_id.to_string(),
                state: PromptState::Completed,
                input: Some(input.to_string()),
                output: vec![PromptOutput::Text {
                    content: format!("response to: {input}"),
                }],
                usage: aperture_engine::prompt::PromptUsage {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            })
        }
    }

    #[tokio::test]
    async fn full_conversation_integration() {
        let mut engine = Engine::new();
        engine
            .register(Box::new(InMemoryDbPlugin))
            .await
            .unwrap();
        engine
            .register(Box::new(ConversationPlugin))
            .await
            .unwrap();

        // Insert PromptRunner after plugins are registered.
        let runner: Box<dyn PromptRunner> = Box::new(MockPromptRunner);
        engine.insert_extension(runner);

        // 1. Create conversation.
        let result = engine
            .invoke_action(
                "create_conversation",
                "user-1",
                json!({"title": "Test Chat"}),
            )
            .await
            .unwrap();
        let conv_id = result["conversation_id"].as_str().unwrap().to_string();

        // 2. List conversations.
        let result = engine
            .invoke_action("list_conversations", "user-1", json!({}))
            .await
            .unwrap();
        let convs = result.as_array().unwrap();
        assert_eq!(convs.len(), 1);
        assert_eq!(convs[0]["title"], "Test Chat");

        // 3. Send a message.
        let result = engine
            .invoke_action(
                "send_message",
                "user-1",
                json!({"conversation_id": conv_id, "message": "hello"}),
            )
            .await
            .unwrap();
        assert_eq!(result["state"], "completed");

        // 4. Get conversation with prompts.
        let result = engine
            .invoke_action(
                "get_conversation",
                "user-1",
                json!({"conversation_id": conv_id}),
            )
            .await
            .unwrap();
        let prompts = result["prompts"].as_array().unwrap();
        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0]["input"], "hello");
    }

    #[tokio::test]
    async fn prompt_events_persisted_to_db() {
        let mut engine = Engine::new();
        engine
            .register(Box::new(InMemoryDbPlugin))
            .await
            .unwrap();
        engine
            .register(Box::new(ConversationPlugin))
            .await
            .unwrap();

        // Run a prompt through the engine — events should be captured.
        let llm = MockLlm;
        let prompt = engine
            .run(&llm, "user-1", "test input", &[])
            .await
            .unwrap();

        // Give the background task time to process all events (created + completed).
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        // Create a conversation and attach the prompt.
        let result = engine
            .invoke_action(
                "create_conversation",
                "user-1",
                json!({"title": "Event Test"}),
            )
            .await
            .unwrap();
        let conv_id = result["conversation_id"].as_str().unwrap().to_string();

        engine
            .invoke_action(
                "attach_prompt",
                "user-1",
                json!({"conversation_id": conv_id, "prompt_id": prompt.id}),
            )
            .await
            .unwrap();

        let result = engine
            .invoke_action(
                "get_conversation",
                "user-1",
                json!({"conversation_id": conv_id}),
            )
            .await
            .unwrap();
        let prompts = result["prompts"].as_array().unwrap();
        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0]["state"], "completed");
    }
}
