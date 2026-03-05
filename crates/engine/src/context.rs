use serde::{Deserialize, Serialize};

/// A single item of context provided to the model alongside the conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextItem {
    /// The kind of context (e.g. "text", "file", "url").
    pub item_type: String,

    /// Optional identifier for deduplication or reference.
    pub id: Option<String>,

    /// The actual content.
    pub content: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialize_round_trip() {
        let item = ContextItem {
            item_type: "text".to_string(),
            id: Some("ctx-1".to_string()),
            content: "You are a helpful assistant.".to_string(),
        };

        let json = serde_json::to_string(&item).unwrap();
        let deserialized: ContextItem = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.item_type, "text");
        assert_eq!(deserialized.id, Some("ctx-1".to_string()));
        assert_eq!(deserialized.content, "You are a helpful assistant.");
    }

    #[test]
    fn optional_id_can_be_none() {
        let item = ContextItem {
            item_type: "file".to_string(),
            id: None,
            content: "file contents".to_string(),
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("null") || !json.contains("\"id\""));
    }
}
