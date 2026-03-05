use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::tool::Tool;

/// Resolves script files from the workspace and checks pre-approval status.
///
/// Implemented by the runtime crate (which has access to the filesystem and
/// `script-rules.toml`). Consumed by the sandbox-code crate via extensions.
pub trait ScriptResolver: Send + Sync {
    /// Read a script file from the user's workspace. Returns file content.
    fn read_script(&self, user_id: &str, path: &str) -> std::result::Result<String, String>;

    /// Check if a script is pre-approved. Implementation computes SHA-256
    /// of content and compares against stored approvals.
    fn is_approved(&self, user_id: &str, path: &str, content: &str) -> bool;
}

/// Lightweight tool metadata without the invocation handler.
/// Used by the sandbox to know what functions to expose.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptor {
    pub id: String,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Option<Value>,
}

impl From<&Tool> for ToolDescriptor {
    fn from(tool: &Tool) -> Self {
        Self {
            id: tool.id.clone(),
            description: tool.description.clone(),
            input_schema: tool.input_schema.clone(),
            output_schema: tool.output_schema.clone(),
        }
    }
}

/// A recorded entry in the replay log, capturing the result of a
/// non-deterministic operation during sandbox execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ReplayEntry {
    ToolCall {
        tool_id: String,
        input: Value,
        output: Value,
    },
    ToolCallError {
        tool_id: String,
        input: Value,
        error: String,
    },
    DateNow {
        value: f64,
    },
    MathRandom {
        value: f64,
    },
}

/// Captures the state needed to resume a sandbox script after approval.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingApproval {
    pub code: String,
    pub replay_log: Vec<ReplayEntry>,
    pub tool_id: String,
    pub tool_input: Value,
    pub approval_reason: String,
}

/// A request from the sandbox to the host loop.
pub enum SandboxRequest {
    ToolCall {
        tool_id: String,
        input: Value,
        response: tokio::sync::oneshot::Sender<crate::error::Result<Value>>,
    },
    DateNow {
        response: tokio::sync::oneshot::Sender<f64>,
    },
    MathRandom {
        response: tokio::sync::oneshot::Sender<f64>,
    },
}

/// Result of sandbox code execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxResult {
    pub value: Value,
    pub console_output: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn replay_entry_serialization_round_trip() {
        let entries = vec![
            ReplayEntry::ToolCall {
                tool_id: "fs_read".into(),
                input: json!({"path": "/tmp/a"}),
                output: json!("contents"),
            },
            ReplayEntry::ToolCallError {
                tool_id: "fs_read".into(),
                input: json!({"path": "/nope"}),
                error: "not found".into(),
            },
            ReplayEntry::DateNow { value: 1709568000000.0 },
            ReplayEntry::MathRandom { value: 0.42 },
        ];

        let json = serde_json::to_string(&entries).unwrap();
        let round_tripped: Vec<ReplayEntry> = serde_json::from_str(&json).unwrap();
        assert_eq!(round_tripped.len(), 4);

        let json_val = serde_json::to_value(&entries[0]).unwrap();
        assert_eq!(json_val["type"], "tool_call");
        assert_eq!(json_val["tool_id"], "fs_read");
    }

    #[test]
    fn pending_approval_serialization_round_trip() {
        let pending = PendingApproval {
            code: "fs_write('/tmp/x', 'data')".into(),
            replay_log: vec![ReplayEntry::ToolCall {
                tool_id: "fs_read".into(),
                input: json!({"path": "/tmp/a"}),
                output: json!("ok"),
            }],
            tool_id: "fs_write".into(),
            tool_input: json!({"path": "/tmp/x", "content": "data"}),
            approval_reason: "write to filesystem".into(),
        };

        let json = serde_json::to_string(&pending).unwrap();
        let round_tripped: PendingApproval = serde_json::from_str(&json).unwrap();
        assert_eq!(round_tripped.code, pending.code);
        assert_eq!(round_tripped.replay_log.len(), 1);
        assert_eq!(round_tripped.tool_id, "fs_write");
    }
}
