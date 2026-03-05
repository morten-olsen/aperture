use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;

use crate::error::Result;
use crate::event::EventBus;
use crate::extensions::Extensions;
use crate::sandbox::ReplayEntry;
use crate::state::State;

/// Context passed to a tool when it is invoked.
pub struct ToolContext<'a> {
    pub input: Value,
    pub state: &'a mut State,
    pub extensions: &'a Extensions,
    pub events: &'a EventBus,
    pub user_id: String,
    pub replay: Option<Vec<ReplayEntry>>,
}

/// Trait for types that can be invoked as a tool.
#[async_trait]
pub trait ToolInvoke: Send + Sync {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value>;
}

/// Context passed to dynamic approval functions.
pub struct ApprovalContext<'a> {
    pub extensions: &'a Extensions,
    pub user_id: &'a str,
}

/// A function that decides at invocation time whether approval is needed.
/// Returns `Some(reason)` if approval is required, `None` otherwise.
pub type ApprovalFn = Arc<dyn Fn(&Value, &ApprovalContext<'_>) -> Option<String> + Send + Sync>;

/// When/whether a tool requires human approval before executing.
pub enum ApprovalRequirement {
    /// Always require approval, with a static reason shown to the user.
    Always { reason: String },

    /// Decide at invocation time based on the input.
    Dynamic(ApprovalFn),
}

impl Clone for ApprovalRequirement {
    fn clone(&self) -> Self {
        match self {
            Self::Always { reason } => Self::Always {
                reason: reason.clone(),
            },
            Self::Dynamic(f) => Self::Dynamic(f.clone()),
        }
    }
}

/// A tool that can be called by the model during the agent loop.
pub struct Tool {
    pub id: String,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Option<Value>,
    pub require_approval: Option<ApprovalRequirement>,
    pub invoke: Arc<dyn ToolInvoke>,
}

impl Clone for Tool {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            description: self.description.clone(),
            input_schema: self.input_schema.clone(),
            output_schema: self.output_schema.clone(),
            require_approval: self.require_approval.clone(),
            invoke: self.invoke.clone(),
        }
    }
}
