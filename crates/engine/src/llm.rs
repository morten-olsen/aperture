use async_trait::async_trait;
use serde_json::Value;

use crate::error::Result;
use crate::prompt::PromptOutput;
use crate::tool::Tool;

// ── LLM abstraction ──────────────────────────────────────────────────

/// A message in the format expected by the LLM.
#[derive(Debug, Clone)]
pub enum LlmMessage {
    System(String),
    User(String),
    Assistant(String),
    ToolCall { tool_id: String, input: Value },
    ToolResponse { tool_id: String, output: Value },
}

/// The response the LLM produces for a single turn.
#[derive(Debug, Clone)]
pub struct LlmResponse {
    /// The outputs the model wants to produce (text, tool calls, etc.).
    pub outputs: Vec<PromptOutput>,
    /// Token usage for this turn.
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

/// Trait abstracting the model call, making the engine testable without a real LLM.
#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn call(&self, messages: &[LlmMessage], tools: &[&Tool]) -> Result<LlmResponse>;
}
