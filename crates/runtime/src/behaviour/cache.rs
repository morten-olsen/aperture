use std::path::Path;

use aperture_engine::error::{EngineError, Result};

use super::model::EmbeddingCache;

/// Load an embedding cache from disk. Returns `Ok(None)` if the file does not exist.
pub async fn load_cache(path: &Path) -> Result<Option<EmbeddingCache>> {
    match tokio::fs::read_to_string(path).await {
        Ok(content) => {
            let cache: EmbeddingCache = serde_json::from_str(&content)
                .map_err(|e| EngineError::PluginPrepare(format!("invalid cache JSON: {e}")))?;
            Ok(Some(cache))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(EngineError::PluginPrepare(format!(
            "failed to read cache: {e}"
        ))),
    }
}

/// Save an embedding cache to disk, creating parent directories as needed.
pub async fn save_cache(path: &Path, cache: &EmbeddingCache) -> Result<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| EngineError::PluginPrepare(format!("failed to create cache dir: {e}")))?;
    }

    let json = serde_json::to_string_pretty(cache)
        .map_err(|e| EngineError::PluginPrepare(format!("failed to serialize cache: {e}")))?;

    tokio::fs::write(path, json.as_bytes())
        .await
        .map_err(|e| EngineError::PluginPrepare(format!("failed to write cache: {e}")))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    use super::super::model::EmbeddingCacheEntry;

    #[tokio::test]
    async fn load_save_round_trip() {
        let tmp =
            std::env::temp_dir().join(format!("aperture-cache-test-{}", uuid::Uuid::new_v4()));
        let cache_path = tmp.join("embeddings.json");

        let mut entries = HashMap::new();
        entries.insert(
            "deploy".to_string(),
            EmbeddingCacheEntry {
                description_hash: "abc123".into(),
                embedding: vec![0.1, 0.2, 0.3],
            },
        );

        let cache = EmbeddingCache {
            model: "text-embedding-3-small".into(),
            entries,
        };

        save_cache(&cache_path, &cache).await.unwrap();
        let loaded = load_cache(&cache_path).await.unwrap().unwrap();

        assert_eq!(loaded.model, "text-embedding-3-small");
        assert!(loaded.entries.contains_key("deploy"));
        assert_eq!(loaded.entries["deploy"].description_hash, "abc123");
        assert_eq!(loaded.entries["deploy"].embedding, vec![0.1, 0.2, 0.3]);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn load_missing_returns_none() {
        let path = std::env::temp_dir().join("aperture-cache-missing-file.json");
        let result = load_cache(&path).await.unwrap();
        assert!(result.is_none());
    }
}
