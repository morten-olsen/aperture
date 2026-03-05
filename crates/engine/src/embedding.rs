use async_trait::async_trait;

use crate::error::Result;

/// Trait abstracting embedding calls, making the engine testable without a real provider.
#[async_trait]
pub trait EmbeddingClient: Send + Sync {
    /// The model identifier (e.g. "text-embedding-3-small").
    fn model_id(&self) -> &str;

    /// Embed one or more texts, returning one vector per input text.
    async fn embed(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>;
}
