pub(crate) mod actions;
pub(crate) mod db;
pub(crate) mod events;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::action::Action;
use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, SetupContext};
use aperture_engine::prompt::Prompt;

use self::events::{CONVERSATION_CREATED, CONVERSATION_PROMPT_ATTACHED};
use crate::db::DatabaseService;

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

        db.call(db::migrate).await?;

        // 2. Register conversation events.
        ctx.events.register_event(&CONVERSATION_CREATED).await;
        ctx.events
            .register_event(&CONVERSATION_PROMPT_ATTACHED)
            .await;

        // 3. Subscribe to prompt events and persist to DB.
        //
        // Uses the wildcard listener (single channel) instead of select! on
        // three separate broadcast channels. A single channel guarantees
        // in-order delivery and avoids scheduling-dependent event loss.
        let db_for_listener = db.clone();
        let mut rx = ctx.events.listen_all();

        tokio::spawn(async move {
            while let Ok(envelope) = rx.recv().await {
                let is_prompt_event = matches!(
                    envelope.event_id.as_str(),
                    "prompt.created" | "prompt.updated" | "prompt.completed"
                );
                if !is_prompt_event {
                    continue;
                }

                let prompt: Prompt = match serde_json::from_value(envelope.payload) {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                let id = prompt.id.clone();
                let user_id = prompt.user_id.clone();
                let state = db::state_to_str(&prompt.state).to_string();
                let input = prompt.input.clone();
                let output_json = serde_json::to_string(&prompt.output).unwrap_or_default();
                let usage_json = serde_json::to_string(&prompt.usage).unwrap_or_default();

                let _ = db_for_listener
                    .call(move |conn| {
                        db::upsert_prompt(
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
            invoke: Box::new(actions::CreateConversation),
        });

        ctx.actions.push(Action {
            id: "list_conversations".into(),
            description: "List conversations for the current user".into(),
            input_schema: json!({"type": "object"}),
            output_schema: None,
            invoke: Box::new(actions::ListConversations),
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
            invoke: Box::new(actions::GetConversation),
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
            invoke: Box::new(actions::SendMessage),
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
            invoke: Box::new(actions::AttachPrompt),
        });

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::engine::Engine;
    use aperture_engine::llm::{LlmClient, LlmMessage, LlmResponse};
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
        async fn run(&self, user_id: &str, input: &str, _history: &[Prompt]) -> Result<Prompt> {
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
        engine.register(Box::new(InMemoryDbPlugin)).await.unwrap();
        engine.register(Box::new(ConversationPlugin)).await.unwrap();

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
        engine.register(Box::new(InMemoryDbPlugin)).await.unwrap();
        engine.register(Box::new(ConversationPlugin)).await.unwrap();

        // Run a prompt through the engine — events should be captured.
        let llm = MockLlm;
        let prompt = engine.run(&llm, "user-1", "test input", &[]).await.unwrap();

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

        // Poll until the background event listener has persisted the "completed" state.
        // The listener processes PROMPT_CREATED then PROMPT_COMPLETED asynchronously,
        // so we retry instead of relying on a fixed sleep.
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            let result = engine
                .invoke_action(
                    "get_conversation",
                    "user-1",
                    json!({"conversation_id": conv_id}),
                )
                .await
                .unwrap();
            let prompts = result["prompts"].as_array().unwrap();
            if prompts.len() == 1 && prompts[0]["state"] == "completed" {
                break;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "timed out waiting for prompt state 'completed', got: {:?}",
                prompts.first().map(|p| &p["state"])
            );
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    }
}
