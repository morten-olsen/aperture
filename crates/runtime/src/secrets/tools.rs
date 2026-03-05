use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::redaction::RedactionRegistry;
use aperture_engine::tool::{ToolContext, ToolInvoke};

use super::store::SecretStore;

// ── secrets_list ──────────────────────────────────────────────────

pub struct SecretsList;

#[async_trait]
impl ToolInvoke for SecretsList {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let store = ctx
            .extensions
            .get::<SecretStore>()
            .ok_or_else(|| EngineError::ToolInvocation("SecretStore not found".into()))?;

        let summaries = store.list(&ctx.user_id)?;
        let items: Vec<Value> = summaries
            .into_iter()
            .map(|s| json!({"id": s.id, "name": s.name}))
            .collect();

        Ok(json!({ "secrets": items }))
    }
}

// ── secrets_get_value ─────────────────────────────────────────────

pub struct SecretsGetValue;

#[async_trait]
impl ToolInvoke for SecretsGetValue {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let secret_id = ctx
            .input
            .get("secret_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                EngineError::ToolInvocation("missing required field: secret_id".into())
            })?;

        let store = ctx
            .extensions
            .get::<SecretStore>()
            .ok_or_else(|| EngineError::ToolInvocation("SecretStore not found".into()))?;

        let value = store.get_value(&ctx.user_id, secret_id)?;

        // Track the value for redaction so it gets scrubbed from sandbox output.
        if let Some(registry) = ctx.extensions.get::<RedactionRegistry>() {
            registry.track(&value);
        }

        Ok(json!({ "value": value }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;

    use super::super::crypto::SecretKey;
    use crate::config::RuntimeConfig;

    fn test_setup() -> (PathBuf, Extensions) {
        let dir = std::env::temp_dir().join(format!(
            "aperture-secret-tools-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let config = RuntimeConfig {
            data_root: dir.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let key = SecretKey::from_bytes(&[0x42; 32]);
        let store = SecretStore::new(config, key);

        let mut ext = Extensions::new();
        ext.insert(store);
        ext.insert(RedactionRegistry::new());
        (dir, ext)
    }

    fn make_ctx<'a>(
        input: Value,
        state: &'a mut State,
        extensions: &'a Extensions,
        events: &'a EventBus,
    ) -> ToolContext<'a> {
        ToolContext {
            input,
            state,
            extensions,
            events,
            user_id: "testuser".into(),
            replay: None,
        }
    }

    #[tokio::test]
    async fn list_empty() {
        let (dir, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({}), &mut state, &ext, &events);
        let result = SecretsList.invoke(ctx).await.unwrap();
        assert_eq!(result["secrets"].as_array().unwrap().len(), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn list_after_add() {
        let (dir, ext) = test_setup();
        let store = ext.get::<SecretStore>().unwrap();
        store.add("testuser", "k1", "Key One", "value123").unwrap();

        let mut state = State::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({}), &mut state, &ext, &events);
        let result = SecretsList.invoke(ctx).await.unwrap();
        let secrets = result["secrets"].as_array().unwrap();
        assert_eq!(secrets.len(), 1);
        assert_eq!(secrets[0]["id"], "k1");
        assert_eq!(secrets[0]["name"], "Key One");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn get_value_returns_and_tracks() {
        let (dir, ext) = test_setup();
        let store = ext.get::<SecretStore>().unwrap();
        store
            .add("testuser", "pw", "Password", "supersecretpassword")
            .unwrap();

        let mut state = State::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({"secret_id": "pw"}), &mut state, &ext, &events);
        let result = SecretsGetValue.invoke(ctx).await.unwrap();
        assert_eq!(result["value"], "supersecretpassword");

        // Verify it was tracked for redaction.
        let registry = ext.get::<RedactionRegistry>().unwrap();
        let redacted = registry.redact_str("got supersecretpassword here");
        assert_eq!(redacted, "got [REDACTED] here");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn get_value_missing_fails() {
        let (dir, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({"secret_id": "nope"}), &mut state, &ext, &events);
        let result = SecretsGetValue.invoke(ctx).await;
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
