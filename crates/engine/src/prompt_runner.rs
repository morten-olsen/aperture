use async_trait::async_trait;

use crate::error::Result;
use crate::prompt::Prompt;

#[async_trait]
pub trait PromptRunner: Send + Sync {
    async fn run(&self, user_id: &str, input: &str, history: &[Prompt]) -> Result<Prompt>;
}
