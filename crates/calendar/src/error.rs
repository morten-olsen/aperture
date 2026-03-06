use aperture_engine::error::EngineError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CalendarError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("CalDAV error: {0}")]
    Caldav(String),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("XML parsing error: {0}")]
    Xml(String),

    #[error("iCalendar parsing error: {0}")]
    Ical(String),

    #[error("account not found: {0}")]
    AccountNotFound(String),

    #[error("secret store unavailable")]
    SecretStoreUnavailable,
}

impl From<CalendarError> for EngineError {
    fn from(e: CalendarError) -> Self {
        EngineError::ToolInvocation(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, CalendarError>;
