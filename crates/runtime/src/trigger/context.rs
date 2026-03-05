use serde::{Deserialize, Serialize};

use aperture_engine::context::ContextItem;
use aperture_engine::error::Result;
use aperture_engine::plugin::{PreflightContext, PrepareContext};
use aperture_engine::tool::ToolContext;

use super::model::TriggerState;

/// Cached result of setup script execution, stored in State to avoid re-running.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PreflightCache {
    setup_output: Option<String>,
}

/// During prepare: inject trigger context if this prompt was fired by a trigger.
pub fn inject_trigger_context(ctx: &mut PrepareContext<'_>) -> Result<()> {
    let trigger_state: Option<TriggerState> = ctx.state.get("trigger")?;
    let Some(ts) = trigger_state else {
        return Ok(());
    };

    ctx.context.push(ContextItem {
        item_type: "trigger".into(),
        id: Some(format!("trigger:{}", ts.name)),
        content: format!(
            "This prompt was triggered by schedule '{}' (type: {}). \
             Your final text output will be saved as the continuation message for the next invocation.",
            ts.name, ts.schedule_type,
        ),
    });

    Ok(())
}

/// During preflight: if a setup_script exists and hasn't been run yet, invoke it.
pub async fn run_preflight(ctx: &mut PreflightContext<'_>) -> Result<()> {
    // Check if we're in a trigger context.
    let trigger_state: Option<TriggerState> = ctx.state.get("trigger")?;
    let Some(_ts) = trigger_state else {
        return Ok(());
    };

    // Check if preflight already ran this loop iteration.
    let cache: Option<PreflightCache> = ctx.state.get("trigger_preflight")?;
    if cache.is_some() {
        return Ok(());
    }

    // Find the run_code tool if we need to run a setup script.
    // The setup_script is stored in the trigger file, not in TriggerState (which is minimal).
    // The scheduler injects setup script output as a context item directly before run_with_state.
    // So preflight just marks that it ran.
    ctx.state
        .set("trigger_preflight", &PreflightCache { setup_output: None })?;

    Ok(())
}

/// Build a ToolContext for invoking a tool during preflight.
/// Unused for now — reserved for future setup script execution.
#[allow(dead_code)]
pub fn build_tool_context<'a>(
    input: serde_json::Value,
    state: &'a mut aperture_engine::state::State,
    extensions: &'a aperture_engine::extensions::Extensions,
    events: &'a aperture_engine::event::EventBus,
    user_id: String,
) -> ToolContext<'a> {
    ToolContext {
        input,
        state,
        extensions,
        events,
        user_id,
        replay: None,
    }
}
