use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// A behaviour definition stored in `.behaviour/*.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Behaviour {
    pub description: String,
    pub process: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// A single cached embedding keyed by behaviour name.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingCacheEntry {
    pub description_hash: String,
    pub embedding: Vec<f32>,
}

/// Persistent embedding cache for all behaviours.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingCache {
    pub model: String,
    pub entries: HashMap<String, EmbeddingCacheEntry>,
}

/// Cached search result for the current prompt to avoid re-embedding the same input.
#[derive(Debug, Clone)]
pub struct CachedSearch {
    pub input_hash: String,
    pub matches: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn behaviour_round_trip() {
        let b = Behaviour {
            description: "Deploy scripts".into(),
            process: "1. Build\n2. Push\n3. Verify".into(),
            notes: Some("Only on staging first".into()),
        };

        let json = serde_json::to_string(&b).unwrap();
        let parsed: Behaviour = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.description, "Deploy scripts");
        assert_eq!(parsed.process, "1. Build\n2. Push\n3. Verify");
        assert_eq!(parsed.notes.as_deref(), Some("Only on staging first"));
    }

    #[test]
    fn minimal_behaviour_without_notes() {
        let json = r#"{"description": "Query PG", "process": "Use psql"}"#;
        let b: Behaviour = serde_json::from_str(json).unwrap();

        assert_eq!(b.description, "Query PG");
        assert_eq!(b.process, "Use psql");
        assert!(b.notes.is_none());
    }
}
