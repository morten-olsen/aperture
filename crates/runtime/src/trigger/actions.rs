use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::action::{Action, ActionContext, ActionInvoke};
use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::SetupContext;

use crate::config::RuntimeConfig;
use crate::validation::{self, FileValidationService};

use super::events::{TriggerUpdatedPayload, TRIGGER_UPDATED};
use super::model::Trigger;
use super::scheduler::TriggerScheduler;

fn get_config<'a>(ctx: &'a ActionContext<'a>) -> Result<&'a RuntimeConfig> {
    ctx.extensions
        .get::<RuntimeConfig>()
        .ok_or_else(|| EngineError::ToolInvocation("RuntimeConfig not found".into()))
}

fn triggers_dir(config: &RuntimeConfig, user_id: &str) -> std::path::PathBuf {
    config.workspace_dir(user_id).join(".triggers")
}

pub fn register_actions(ctx: &mut SetupContext<'_>) -> Result<()> {
    ctx.actions.push(Action {
        id: "list_triggers".into(),
        description: "List all triggers for the current user".into(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "user_id": {"type": "string"}
            },
            "required": ["user_id"]
        }),
        output_schema: None,
        invoke: Box::new(ListTriggers),
    });

    ctx.actions.push(Action {
        id: "get_trigger".into(),
        description: "Get a trigger by name".into(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }),
        output_schema: None,
        invoke: Box::new(GetTrigger),
    });

    ctx.actions.push(Action {
        id: "delete_trigger".into(),
        description: "Delete a trigger by name".into(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        }),
        output_schema: None,
        invoke: Box::new(DeleteTrigger),
    });

    ctx.actions.push(Action {
        id: "update_trigger".into(),
        description: "Update fields on an existing trigger".into(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "status": {"type": "string"},
                "goal": {"type": "string"},
                "schedule_value": {"type": "string"},
                "continuation": {"type": "string"}
            },
            "required": ["name"]
        }),
        output_schema: None,
        invoke: Box::new(UpdateTrigger),
    });

    ctx.actions.push(Action {
        id: "reload_triggers".into(),
        description: "Reload all triggers from disk (use after external filesystem changes)".into(),
        input_schema: json!({"type": "object"}),
        output_schema: None,
        invoke: Box::new(ReloadTriggers),
    });

    Ok(())
}

// ── ListTriggers ────────────────────────────────────────────────────

struct ListTriggers;

#[async_trait]
impl ActionInvoke for ListTriggers {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let user_id = ctx.input["user_id"].as_str().unwrap_or(&ctx.user_id);
        let dir = triggers_dir(config, user_id);

        if !dir.exists() {
            return Ok(json!([]));
        }

        let mut triggers = Vec::new();
        let mut entries = tokio::fs::read_dir(&dir)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to read .triggers/: {e}")))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("read entry: {e}")))?
        {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let content = match tokio::fs::read_to_string(&path).await {
                Ok(c) => c,
                Err(_) => continue,
            };
            match serde_json::from_str::<Trigger>(&content) {
                Ok(t) => triggers.push(serde_json::to_value(&t).unwrap_or_default()),
                Err(_) => continue,
            }
        }

        Ok(Value::Array(triggers))
    }
}

// ── GetTrigger ──────────────────────────────────────────────────────

struct GetTrigger;

#[async_trait]
impl ActionInvoke for GetTrigger {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let name = ctx.input["name"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("name required".into()))?;
        let dir = triggers_dir(config, &ctx.user_id);
        let path = dir.join(format!("{name}.json"));

        let content = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("trigger not found: {e}")))?;

        let trigger: Trigger = serde_json::from_str(&content)
            .map_err(|e| EngineError::ToolInvocation(format!("invalid trigger: {e}")))?;

        serde_json::to_value(&trigger)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize: {e}")))
    }
}

// ── DeleteTrigger ───────────────────────────────────────────────────

struct DeleteTrigger;

#[async_trait]
impl ActionInvoke for DeleteTrigger {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let name = ctx.input["name"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("name required".into()))?;
        let dir = triggers_dir(config, &ctx.user_id);
        let path = dir.join(format!("{name}.json"));

        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to delete trigger: {e}")))?;

        Ok(json!({"deleted": name}))
    }
}

// ── UpdateTrigger ───────────────────────────────────────────────────

struct UpdateTrigger;

#[async_trait]
impl ActionInvoke for UpdateTrigger {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let name = ctx.input["name"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("name required".into()))?;
        let dir = triggers_dir(config, &ctx.user_id);
        let path = dir.join(format!("{name}.json"));

        // Read existing trigger.
        let content = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("trigger not found: {e}")))?;
        let mut trigger: Trigger = serde_json::from_str(&content)
            .map_err(|e| EngineError::ToolInvocation(format!("invalid trigger: {e}")))?;

        // Apply updates.
        if let Some(status) = ctx.input.get("status").and_then(|v| v.as_str()) {
            trigger.status = serde_json::from_value(Value::String(status.into()))
                .map_err(|e| EngineError::ToolInvocation(format!("invalid status: {e}")))?;
        }
        if let Some(goal) = ctx.input.get("goal").and_then(|v| v.as_str()) {
            trigger.goal = goal.to_string();
        }
        if let Some(sv) = ctx.input.get("schedule_value").and_then(|v| v.as_str()) {
            trigger.schedule_value = sv.to_string();
        }
        if let Some(c) = ctx.input.get("continuation") {
            if c.is_null() {
                trigger.continuation = None;
            } else if let Some(s) = c.as_str() {
                trigger.continuation = Some(s.to_string());
            }
        }

        // Write back through validated_write.
        let updated_json = serde_json::to_string_pretty(&trigger)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize: {e}")))?;

        let rel_path = format!(".triggers/{name}.json");
        let validation_service = ctx.extensions.get::<FileValidationService>();

        validation::validated_write(
            config,
            &ctx.user_id,
            &rel_path,
            &updated_json,
            validation_service,
        )
        .await?;

        ctx.events
            .publish(
                &TRIGGER_UPDATED,
                &TriggerUpdatedPayload {
                    name: name.to_string(),
                    user_id: ctx.user_id.clone(),
                },
                Some(&ctx.user_id),
            )
            .await;

        serde_json::to_value(&trigger)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize: {e}")))
    }
}

// ── ReloadTriggers ──────────────────────────────────────────────────

struct ReloadTriggers;

#[async_trait]
impl ActionInvoke for ReloadTriggers {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let scheduler = ctx
            .extensions
            .get::<Arc<TriggerScheduler>>()
            .ok_or_else(|| EngineError::ToolInvocation("TriggerScheduler not found".into()))?;

        scheduler.load_all_triggers().await?;

        Ok(json!({"reloaded": true}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;

    use crate::config::RuntimeConfig;
    use crate::trigger::TriggerScheduler;

    fn test_setup() -> (std::path::PathBuf, Extensions, EventBus) {
        let tmp = std::env::temp_dir().join(format!(
            "aperture-trigger-action-test-{}",
            uuid::Uuid::new_v4()
        ));
        let ws = tmp.join("testuser").join("workspace");
        let triggers = ws.join(".triggers");
        std::fs::create_dir_all(&triggers).unwrap();
        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let mut ext = Extensions::new();
        ext.insert(config);
        let events = EventBus::new();
        (tmp, ext, events)
    }

    fn write_trigger(tmp: &std::path::Path, name: &str, trigger: &Trigger) {
        let path = tmp
            .join("testuser")
            .join("workspace")
            .join(".triggers")
            .join(format!("{name}.json"));
        std::fs::write(path, serde_json::to_string_pretty(trigger).unwrap()).unwrap();
    }

    fn sample_trigger(name: &str) -> Trigger {
        Trigger {
            name: name.into(),
            goal: "test goal".into(),
            schedule_type: "once".into(),
            schedule_value: "2026-03-05T12:00:00Z".into(),
            status: super::super::model::TriggerStatus::Active,
            setup_script: None,
            max_invocations: None,
            ends_at: None,
            continuation: None,
            invocation_count: 0,
            last_invoked_at: None,
            next_invocation_at: None,
            consecutive_failures: 0,
            last_error: None,
        }
    }

    #[tokio::test]
    async fn list_triggers_returns_all() {
        let (tmp, ext, events) = test_setup();
        write_trigger(&tmp, "trigger-a", &sample_trigger("trigger-a"));
        write_trigger(&tmp, "trigger-b", &sample_trigger("trigger-b"));

        let ctx = ActionContext {
            user_id: "testuser".into(),
            input: json!({"user_id": "testuser"}),
            extensions: &ext,
            events: &events,
        };

        let result = ListTriggers.invoke(ctx).await.unwrap();
        let arr = result.as_array().unwrap();
        assert_eq!(arr.len(), 2);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn get_trigger_returns_one() {
        let (tmp, ext, events) = test_setup();
        write_trigger(&tmp, "my-trigger", &sample_trigger("my-trigger"));

        let ctx = ActionContext {
            user_id: "testuser".into(),
            input: json!({"name": "my-trigger"}),
            extensions: &ext,
            events: &events,
        };

        let result = GetTrigger.invoke(ctx).await.unwrap();
        assert_eq!(result["name"], "my-trigger");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn delete_trigger_removes_file() {
        let (tmp, ext, events) = test_setup();
        write_trigger(&tmp, "doomed", &sample_trigger("doomed"));

        let path = tmp
            .join("testuser")
            .join("workspace")
            .join(".triggers")
            .join("doomed.json");
        assert!(path.exists());

        let ctx = ActionContext {
            user_id: "testuser".into(),
            input: json!({"name": "doomed"}),
            extensions: &ext,
            events: &events,
        };

        DeleteTrigger.invoke(ctx).await.unwrap();
        assert!(!path.exists());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn update_trigger_changes_fields() {
        let (tmp, ext, events) = test_setup();
        write_trigger(&tmp, "updatable", &sample_trigger("updatable"));

        let ctx = ActionContext {
            user_id: "testuser".into(),
            input: json!({
                "name": "updatable",
                "goal": "new goal",
                "status": "paused"
            }),
            extensions: &ext,
            events: &events,
        };

        let result = UpdateTrigger.invoke(ctx).await.unwrap();
        assert_eq!(result["goal"], "new goal");
        assert_eq!(result["status"], "paused");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn reload_triggers_rescans_disk() {
        let tmp = std::env::temp_dir().join(format!(
            "aperture-trigger-reload-test-{}",
            uuid::Uuid::new_v4()
        ));
        let ws = tmp.join("testuser").join("workspace");
        let triggers = ws.join(".triggers");
        std::fs::create_dir_all(&triggers).unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let events = EventBus::new();
        let scheduler = Arc::new(TriggerScheduler::new(config.clone(), events.clone()));

        // No triggers on disk yet.
        assert_eq!(scheduler.trigger_count().await, 0);

        // Write a trigger directly to disk (simulating external edit).
        write_trigger(&tmp, "external", &sample_trigger("external"));

        // Reload via action.
        let mut ext = Extensions::new();
        ext.insert(config);
        ext.insert(Arc::clone(&scheduler));

        let ctx = ActionContext {
            user_id: "testuser".into(),
            input: json!({}),
            extensions: &ext,
            events: &events,
        };
        let result = ReloadTriggers.invoke(ctx).await.unwrap();
        assert_eq!(result["reloaded"], true);

        // Scheduler should now have the trigger.
        assert_eq!(scheduler.trigger_count().await, 1);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
