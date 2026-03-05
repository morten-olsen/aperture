use thiserror::Error;

#[derive(Debug, Error)]
pub enum SandboxError {
    #[error("sandbox unavailable on this platform")]
    Unavailable,

    #[error("sandbox setup failed: {0}")]
    SetupFailed(String),

    #[error("command timed out after {0:?}")]
    Timeout(std::time::Duration),

    #[error("output limit exceeded ({limit} bytes)")]
    OutputLimitExceeded { limit: usize },

    #[error("failed to spawn process: {0}")]
    SpawnFailed(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, SandboxError>;
