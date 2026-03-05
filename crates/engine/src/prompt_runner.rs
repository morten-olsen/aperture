use async_trait::async_trait;

use crate::error::Result;
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
}
