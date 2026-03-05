mod actions;
mod context;
pub(crate) mod events;
pub(crate) mod model;
mod scheduler;

pub use model::{Trigger, TriggerState, TriggerStatus};
pub use scheduler::TriggerScheduler;

use std::sync::Arc;

use async_trait::async_trait;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, PreflightContext, PrepareContext, SetupContext};

use crate::config::RuntimeConfig;
use crate::validation::FileValidationService;

use self::events::{
    TRIGGER_COMPLETED, TRIGGER_FAILED, TRIGGER_FIRED, TRIGGER_STATUS_CHANGED, TRIGGER_UPDATED,
};

pub struct TriggerPlugin;

#[async_trait]
impl Plugin for TriggerPlugin {
    fn id(&self) -> &str {
        "trigger"
    }

    fn description(&self) -> &str {
        "Manages scheduled triggers that fire the agent on a cron or one-shot schedule"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        // 1. Get RuntimeConfig.
        let config = ctx
            .extensions
            .get::<RuntimeConfig>()
            .ok_or_else(|| EngineError::PluginSetup("RuntimeConfig not found".into()))?
            .clone();

        // 2. Set up file validation for .triggers/*.json.
        let validation = if let Some(existing) = ctx.extensions.get::<FileValidationService>() {
            existing
        } else {
            ctx.extensions
                .insert(FileValidationService::new(ctx.events.clone()));
            ctx.extensions
                .get::<FileValidationService>()
                .ok_or_else(|| {
                    EngineError::PluginSetup("failed to create FileValidationService".into())
                })?
        };

        validation.register(
            ".triggers/*.json",
            Box::new(|_path, content| {
                serde_json::from_str::<Trigger>(content)
                    .map(|_| ())
                    .map_err(|e| format!("invalid trigger JSON: {e}"))
            }),
        );

        // 3. Register trigger events.
        ctx.events.register_event(&TRIGGER_FIRED).await;
        ctx.events.register_event(&TRIGGER_COMPLETED).await;
        ctx.events.register_event(&TRIGGER_FAILED).await;
        ctx.events.register_event(&TRIGGER_STATUS_CHANGED).await;
        ctx.events.register_event(&TRIGGER_UPDATED).await;

        // 4. Create scheduler and store in extensions.
        let scheduler = Arc::new(TriggerScheduler::new(config, ctx.events.clone()));
        ctx.extensions.insert(scheduler);

        // 5. Register actions.
        actions::register_actions(ctx)?;

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        context::inject_trigger_context(ctx)
    }

    async fn preflight(&self, ctx: &mut PreflightContext<'_>) -> Result<()> {
        context::run_preflight(ctx).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::context::ContextItem;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;
    use aperture_engine::tool::Tool;

    #[test]
    fn trigger_state_inject_and_read() {
        let mut state = State::new();
        let ts = TriggerState {
            name: "daily-report".into(),
            schedule_type: "cron".into(),
        };
        state.set("trigger", &ts).unwrap();

        let read: Option<TriggerState> = state.get("trigger").unwrap();
        assert!(read.is_some());
        assert_eq!(read.unwrap().name, "daily-report");
    }

    #[tokio::test]
    async fn prepare_without_trigger_state_adds_no_context() {
        let extensions = Extensions::new();
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools = Vec::new();
        let mut context_items: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "test-user",
            input: "",
            tools: &mut tools,
            context: &mut context_items,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        context::inject_trigger_context(&mut ctx).unwrap();
        assert!(context_items.is_empty());
    }

    #[tokio::test]
    async fn prepare_with_trigger_state_injects_context() {
        let extensions = Extensions::new();
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools = Vec::new();
        let mut context_items: Vec<ContextItem> = Vec::new();

        // Simulate trigger state.
        let ts = TriggerState {
            name: "daily-report".into(),
            schedule_type: "cron".into(),
        };
        state.set("trigger", &ts).unwrap();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "test-user",
            input: "",
            tools: &mut tools,
            context: &mut context_items,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        context::inject_trigger_context(&mut ctx).unwrap();
        assert!(!context_items.is_empty());
        assert!(context_items
            .iter()
            .any(|c| c.content.contains("daily-report")));
    }

    #[tokio::test]
    async fn preflight_without_trigger_state_is_noop() {
        let extensions = Extensions::new();
        let events = EventBus::new();
        let mut state = State::new();
        let tools: Vec<Tool> = Vec::new();
        let mut context_items: Vec<ContextItem> = Vec::new();

        let mut ctx = PreflightContext {
            user_id: "test-user",
            tools: &tools,
            context: &mut context_items,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
        };

        context::run_preflight(&mut ctx).await.unwrap();
        assert!(context_items.is_empty());
    }
}
