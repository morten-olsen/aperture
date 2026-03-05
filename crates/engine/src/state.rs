use std::collections::HashMap;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::error::{EngineError, Result};

/// Per-conversation ephemeral state, keyed by plugin ID.
///
/// Values are stored as `serde_json::Value` so any serializable type can be
/// used. Each plugin owns a single key (its ID) in the map.
pub struct State {
    map: HashMap<String, Value>,
}

impl State {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    /// Retrieve the state for a plugin, deserializing into `T`.
    /// Returns `Ok(None)` if no state exists for this plugin.
    pub fn get<T: DeserializeOwned>(&self, plugin_id: &str) -> Result<Option<T>> {
        match self.map.get(plugin_id) {
            Some(value) => {
                let deserialized = serde_json::from_value(value.clone())
                    .map_err(|e| EngineError::StateError(format!("deserialize {plugin_id}: {e}")))?;
                Ok(Some(deserialized))
            }
            None => Ok(None),
        }
    }

    /// Set the state for a plugin, serializing from `T`.
    pub fn set<T: Serialize>(&mut self, plugin_id: &str, value: &T) -> Result<()> {
        let json = serde_json::to_value(value)
            .map_err(|e| EngineError::StateError(format!("serialize {plugin_id}: {e}")))?;
        self.map.insert(plugin_id.to_string(), json);
        Ok(())
    }
}

impl Default for State {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Counter {
        count: u32,
    }

    #[test]
    fn set_get_round_trip() {
        let mut state = State::new();
        let counter = Counter { count: 5 };
        state.set("my-plugin", &counter).unwrap();

        let retrieved: Counter = state.get("my-plugin").unwrap().unwrap();
        assert_eq!(retrieved, counter);
    }

    #[test]
    fn get_missing_returns_none() {
        let state = State::new();
        let result: Option<Counter> = state.get("nonexistent").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn type_mismatch_returns_error() {
        let mut state = State::new();
        state.set("plugin", &"a string value").unwrap();

        let result: Result<Option<Counter>> = state.get("plugin");
        assert!(result.is_err());
    }
}
