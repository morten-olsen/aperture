use async_trait::async_trait;

use crate::error::{EngineError, Result};
use crate::prompt::Prompt;
use crate::state::State;

#[async_trait]
pub trait PromptRunner: Send + Sync {
    async fn run(&self, user_id: &str, input: &str, history: &[Prompt]) -> Result<Prompt>;

    /// Like `run()` but with a pre-populated state. Defaults to ignoring the state.
    async fn run_with_state(
        &self,
        user_id: &str,
        input: &str,
        history: &[Prompt],
        _state: State,
    ) -> Result<Prompt> {
        self.run(user_id, input, history).await
    }

    /// Approve a pending tool invocation and continue the agent loop.
    async fn approve(&self, _prompt: Prompt) -> Result<Prompt> {
        Err(EngineError::ToolInvocation(
            "approve not supported by this runner".into(),
        ))
    }

    /// Reject a pending tool invocation and continue the agent loop.
    async fn reject(&self, _prompt: Prompt, _reason: &str) -> Result<Prompt> {
        Err(EngineError::ToolInvocation(
            "reject not supported by this runner".into(),
        ))
    }
}
