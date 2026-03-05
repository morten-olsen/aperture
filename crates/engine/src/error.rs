use serde_json::Value;
use thiserror::Error;

use crate::sandbox::PendingApproval;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("plugin setup failed: {0}")]
    PluginSetup(String),

    #[error("plugin prepare failed: {0}")]
    PluginPrepare(String),

    #[error("tool invocation failed: {0}")]
    ToolInvocation(String),

    #[error("tool error: {message}")]
    ToolError { message: String, data: Value },

    #[error("tool not found: {0}")]
    ToolNotFound(String),

    #[error("state error: {0}")]
    StateError(String),

    #[error("action not found: {0}")]
    ActionNotFound(String),

    #[error("approval required: {reason}")]
    ApprovalRequired {
        reason: String,
        approval: Box<PendingApproval>,
    },
}

impl EngineError {
    pub fn tool_error(message: impl Into<String>, data: Value) -> Self {
        EngineError::ToolError {
            message: message.into(),
            data,
        }
    }
}

pub type Result<T> = std::result::Result<T, EngineError>;
