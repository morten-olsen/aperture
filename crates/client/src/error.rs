#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Handshake failed: {0}")]
    Handshake(String),

    #[error("Connection closed")]
    ConnectionClosed,

    #[error("Action error: {0}")]
    ActionError(String),
}

pub type Result<T> = std::result::Result<T, ClientError>;
