use std::sync::RwLock;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::event::{EventBus, EventDescriptor};
use glob_match::glob_match;
use serde::{Deserialize, Serialize};

use crate::config::RuntimeConfig;
use crate::workspace::resolve_sandboxed_path;

/// Event published after a validated write completes successfully.
pub static FILE_VALIDATED_WRITE: EventDescriptor<FileWritePayload> =
    EventDescriptor::new("file.validated_write");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileWritePayload {
    pub path: String,
    pub user_id: String,
}

type ValidatorFn = Box<dyn Fn(&str, &str) -> std::result::Result<(), String> + Send + Sync>;

/// Service that validates file content before writes, keyed by glob patterns.
pub struct FileValidationService {
    validators: RwLock<Vec<(String, ValidatorFn)>>,
    events: EventBus,
}

impl FileValidationService {
    pub fn new(events: EventBus) -> Self {
        Self {
            validators: RwLock::new(Vec::new()),
            events,
        }
    }

    /// Register a validator for files matching the given glob pattern.
    pub fn register(&self, pattern: &str, validator: ValidatorFn) {
        let mut validators = self.validators.write().unwrap_or_else(|e| e.into_inner());
        validators.push((pattern.to_string(), validator));
    }

    /// Validate content for a given path against all matching validators.
    pub fn validate(&self, path: &str, content: &str) -> std::result::Result<(), String> {
        let validators = self.validators.read().unwrap_or_else(|e| e.into_inner());
        for (pattern, validator) in validators.iter() {
            if glob_match(pattern, path) {
                validator(path, content)?;
            }
        }
        Ok(())
    }

    pub fn events(&self) -> &EventBus {
        &self.events
    }
}

/// Write a file through the validation service, publishing an event on success.
pub async fn validated_write(
    config: &RuntimeConfig,
    user_id: &str,
    rel_path: &str,
    content: &str,
    validation: Option<&FileValidationService>,
) -> Result<()> {
    // Validate before writing.
    if let Some(service) = validation {
        service
            .validate(rel_path, content)
            .map_err(|e| EngineError::ToolInvocation(format!("validation failed: {e}")))?;
    }

    // Resolve and write.
    let path = resolve_sandboxed_path(config, user_id, rel_path)?;

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to create directory: {e}")))?;
    }

    tokio::fs::write(&path, content.as_bytes())
        .await
        .map_err(|e| EngineError::ToolInvocation(format!("failed to write file: {e}")))?;

    // Publish event.
    if let Some(service) = validation {
        service
            .events()
            .publish(
                &FILE_VALIDATED_WRITE,
                &FileWritePayload {
                    path: rel_path.to_string(),
                    user_id: user_id.to_string(),
                },
                Some(user_id),
            )
            .await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_matching_pattern() {
        let events = EventBus::new();
        let service = FileValidationService::new(events);
        service.register(
            ".triggers/*.json",
            Box::new(|_path, content| {
                if content.contains("\"name\"") {
                    Ok(())
                } else {
                    Err("missing name field".into())
                }
            }),
        );

        assert!(service
            .validate(".triggers/test.json", r#"{"name": "test"}"#)
            .is_ok());
        assert!(service
            .validate(".triggers/test.json", r#"{"foo": "bar"}"#)
            .is_err());
    }

    #[test]
    fn validate_non_matching_pattern_passes() {
        let events = EventBus::new();
        let service = FileValidationService::new(events);
        service.register(
            ".triggers/*.json",
            Box::new(|_path, _content| Err("always fail".into())),
        );

        // Path doesn't match the pattern, so validator is not called.
        assert!(service.validate("other/file.txt", "anything").is_ok());
    }

    #[tokio::test]
    async fn validated_write_rejects_invalid_content() {
        let tmp = std::env::temp_dir().join(format!("aperture-vw-test-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("testuser").join("workspace");
        std::fs::create_dir_all(&ws).unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let events = EventBus::new();
        let service = FileValidationService::new(events);
        service.register(
            ".triggers/*.json",
            Box::new(|_path, _content| Err("invalid".into())),
        );

        let result = validated_write(
            &config,
            "testuser",
            ".triggers/bad.json",
            "bad content",
            Some(&service),
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("validation failed"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn validated_write_writes_valid_content() {
        let tmp = std::env::temp_dir().join(format!("aperture-vw-ok-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("testuser").join("workspace");
        std::fs::create_dir_all(&ws).unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let events = EventBus::new();
        let service = FileValidationService::new(events);
        service.register(".triggers/*.json", Box::new(|_path, _content| Ok(())));

        validated_write(
            &config,
            "testuser",
            ".triggers/good.json",
            "good content",
            Some(&service),
        )
        .await
        .unwrap();

        let content = std::fs::read_to_string(ws.join(".triggers/good.json")).unwrap();
        assert_eq!(content, "good content");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
