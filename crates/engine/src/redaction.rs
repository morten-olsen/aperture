use std::sync::{Arc, Mutex};

use serde_json::Value;

use crate::sandbox::SandboxResult;

/// Tracks secret values and scrubs them from text before the LLM sees it.
///
/// Values shorter than 8 characters are ignored to avoid false-positive
/// redaction of common short strings.
#[derive(Clone, Default)]
pub struct RedactionRegistry {
    values: Arc<Mutex<Vec<String>>>,
}

impl RedactionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a secret value to be redacted. Values shorter than 8 chars are ignored.
    pub fn track(&self, value: impl Into<String>) {
        let v = value.into();
        if v.len() >= 8 {
            let mut vals = self.values.lock().unwrap_or_else(|e| e.into_inner());
            vals.push(v);
        }
    }

    /// Remove all tracked values.
    pub fn clear(&self) {
        let mut vals = self.values.lock().unwrap_or_else(|e| e.into_inner());
        vals.clear();
    }

    /// Replace all tracked values in `text` with `[REDACTED]`.
    pub fn redact_str(&self, text: &str) -> String {
        let vals = self.values.lock().unwrap_or_else(|e| e.into_inner());
        let mut result = text.to_string();
        for v in vals.iter() {
            result = result.replace(v, "[REDACTED]");
        }
        result
    }

    /// Recursively walk a JSON value, redacting all string leaves in place.
    pub fn redact_value(&self, value: &mut Value) {
        match value {
            Value::String(s) => {
                *s = self.redact_str(s);
            }
            Value::Array(arr) => {
                for item in arr.iter_mut() {
                    self.redact_value(item);
                }
            }
            Value::Object(map) => {
                for (_, v) in map.iter_mut() {
                    self.redact_value(v);
                }
            }
            _ => {}
        }
    }

    /// Redact both the value and console output lines of a sandbox result.
    pub fn redact_result(&self, result: &mut SandboxResult) {
        self.redact_value(&mut result.value);
        for line in result.console_output.iter_mut() {
            *line = self.redact_str(line);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn track_and_redact_string() {
        let r = RedactionRegistry::new();
        r.track("my-secret-api-key-12345");
        assert_eq!(
            r.redact_str("token is my-secret-api-key-12345 here"),
            "token is [REDACTED] here"
        );
    }

    #[test]
    fn short_values_ignored() {
        let r = RedactionRegistry::new();
        r.track("short");
        assert_eq!(r.redact_str("short value"), "short value");
    }

    #[test]
    fn json_deep_walk() {
        let r = RedactionRegistry::new();
        r.track("supersecretvalue");
        let mut val = json!({
            "outer": "has supersecretvalue here",
            "nested": {
                "inner": "also supersecretvalue",
                "num": 42
            },
            "list": ["supersecretvalue", "safe"]
        });
        r.redact_value(&mut val);
        assert_eq!(val["outer"], "has [REDACTED] here");
        assert_eq!(val["nested"]["inner"], "also [REDACTED]");
        assert_eq!(val["nested"]["num"], 42);
        assert_eq!(val["list"][0], "[REDACTED]");
        assert_eq!(val["list"][1], "safe");
    }

    #[test]
    fn clear_resets_tracked_values() {
        let r = RedactionRegistry::new();
        r.track("my-secret-api-key-12345");
        assert!(r
            .redact_str("my-secret-api-key-12345")
            .contains("[REDACTED]"));
        r.clear();
        assert_eq!(
            r.redact_str("my-secret-api-key-12345"),
            "my-secret-api-key-12345"
        );
    }

    #[test]
    fn redact_sandbox_result() {
        let r = RedactionRegistry::new();
        r.track("topsecretpassword");
        let mut result = SandboxResult {
            value: json!({"key": "topsecretpassword"}),
            console_output: vec![
                "fetched topsecretpassword from store".into(),
                "safe line".into(),
            ],
        };
        r.redact_result(&mut result);
        assert_eq!(result.value["key"], "[REDACTED]");
        assert_eq!(result.console_output[0], "fetched [REDACTED] from store");
        assert_eq!(result.console_output[1], "safe line");
    }

    #[test]
    fn multiple_tracked_values() {
        let r = RedactionRegistry::new();
        r.track("first-secret-value");
        r.track("second-secret-val");
        let text = "got first-secret-value and second-secret-val";
        assert_eq!(r.redact_str(text), "got [REDACTED] and [REDACTED]");
    }
}
