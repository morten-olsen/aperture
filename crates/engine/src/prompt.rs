use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::sandbox::PendingApproval;

/// The lifecycle state of a prompt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptState {
    Running,
    Completed,
    WaitingForApproval,
}

/// The result of a tool invocation within a prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ToolResult {
    Success {
        output: Value,
    },
    Error {
        error: String,
    },
    Pending {
        reason: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        approval: Option<PendingApproval>,
    },
}

/// A single output item produced during prompt execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptOutput {
    Text {
        content: String,
    },
    Tool {
        tool_id: String,
        input: Value,
        result: Option<ToolResult>,
    },
    File {
        path: String,
        content: String,
    },
}

/// Token usage statistics for a prompt.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PromptUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// A prompt represents a single user request flowing through the agent loop.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub user_id: String,
    pub state: PromptState,
    pub input: Option<String>,
    pub output: Vec<PromptOutput>,
    pub usage: PromptUsage,
}

impl Prompt {
    pub fn new(id: String, user_id: String, input: Option<String>) -> Self {
        Self {
            id,
            user_id,
            state: PromptState::Running,
            input,
            output: Vec::new(),
            usage: PromptUsage::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_prompt_starts_running() {
        let prompt = Prompt::new("p1".into(), "u1".into(), Some("hello".into()));
        assert_eq!(prompt.state, PromptState::Running);
        assert!(prompt.output.is_empty());
    }

    #[test]
    fn prompt_output_serialization() {
        let text = PromptOutput::Text {
            content: "Hello!".into(),
        };
        let json = serde_json::to_value(&text).unwrap();
        assert_eq!(json["type"], "text");
        assert_eq!(json["content"], "Hello!");
    }

    #[test]
    fn tool_result_tagged_serialization() {
        let success = ToolResult::Success {
            output: serde_json::json!({"answer": 42}),
        };
        let json = serde_json::to_value(&success).unwrap();
        assert_eq!(json["status"], "success");

        let error = ToolResult::Error {
            error: "boom".into(),
        };
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(json["status"], "error");
    }

    #[test]
    fn pending_without_approval_omits_field() {
        let pending = ToolResult::Pending {
            reason: "dangerous".into(),
            approval: None,
        };
        let json = serde_json::to_value(&pending).unwrap();
        assert_eq!(json["status"], "pending");
        assert_eq!(json["reason"], "dangerous");
        assert!(json.get("approval").is_none());
    }

    #[test]
    fn pending_with_approval_includes_field() {
        let pending = ToolResult::Pending {
            reason: "write access".into(),
            approval: Some(PendingApproval {
                code: "fs_write('a','b')".into(),
                replay_log: vec![],
                tool_id: "fs_write".into(),
                tool_input: serde_json::json!({"path": "a"}),
                approval_reason: "write access".into(),
            }),
        };
        let json = serde_json::to_value(&pending).unwrap();
        assert_eq!(json["status"], "pending");
        assert!(json.get("approval").is_some());
        assert_eq!(json["approval"]["tool_id"], "fs_write");
    }
}
