use async_trait::async_trait;

use crate::action::Action;
use crate::context::ContextItem;
use crate::error::Result;
use crate::event::EventBus;
use crate::extensions::Extensions;
use crate::prompt::PromptOutput;
use crate::state::State;
use crate::tool::Tool;

/// Context provided during the setup phase.
///
/// Plugins use this to register services in the type map and subscribe to events.
pub struct SetupContext<'a> {
    pub extensions: &'a mut Extensions,
    pub events: &'a EventBus,
    pub actions: &'a mut Vec<Action>,
}

/// Context provided during the prepare phase (once per prompt).
///
/// Plugins use this to register tools, inject context, and read shared state.
pub struct PrepareContext<'a> {
    pub tools: &'a mut Vec<Tool>,
    pub context: &'a mut Vec<ContextItem>,
    pub state: &'a mut State,
    pub extensions: &'a Extensions,
    pub events: &'a EventBus,
    pub history: &'a [PromptOutput],
}

/// The core plugin trait. Every plugin implements this.
///
/// - `setup` runs once at engine startup (register services, subscribe to events).
/// - `prepare` runs once per prompt (register tools, inject context).
#[async_trait]
pub trait Plugin: Send + Sync {
    /// Unique identifier for this plugin (e.g. "todo", "filesystem").
    fn id(&self) -> &str;

    /// Human-readable name.
    fn name(&self) -> &str {
        self.id()
    }

    /// Short description of what this plugin does.
    fn description(&self) -> &str {
        ""
    }

    /// Called once when the engine starts. Register services and event listeners here.
    async fn setup(&self, _ctx: &mut SetupContext<'_>) -> Result<()> {
        Ok(())
    }

    /// Called once per prompt. Register tools and inject context here.
    async fn prepare(&self, _ctx: &mut PrepareContext<'_>) -> Result<()> {
        Ok(())
    }
}
