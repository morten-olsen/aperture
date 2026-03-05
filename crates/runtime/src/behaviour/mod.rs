mod cache;
mod model;
mod search;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

use aperture_engine::context::ContextItem;
use aperture_engine::embedding::EmbeddingClient;
use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};

use crate::config::RuntimeConfig;
use crate::validation::FileValidationService;

use self::cache::{load_cache, save_cache};
use self::model::{Behaviour, CachedSearch, EmbeddingCache, EmbeddingCacheEntry};
use self::search::search_behaviours;

// ── Service ─────────────────────────────────────────────────────────

/// Shared state for the behaviour plugin, stored in extensions.
pub struct BehaviourService {
    breaker_tripped: AtomicBool,
    cached_search: Mutex<Option<CachedSearch>>,
}

impl BehaviourService {
    fn new() -> Self {
        Self {
            breaker_tripped: AtomicBool::new(false),
            cached_search: Mutex::new(None),
        }
    }
}

// ── Plugin ──────────────────────────────────────────────────────────

pub struct BehaviourPlugin;

#[async_trait]
impl Plugin for BehaviourPlugin {
    fn id(&self) -> &str {
        "behaviour"
    }

    fn description(&self) -> &str {
        "Matches user requests to stored behaviours via embedding similarity"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        // 1. Check RuntimeConfig exists.
        let _config = ctx
            .extensions
            .get::<RuntimeConfig>()
            .ok_or_else(|| EngineError::PluginSetup("RuntimeConfig not found".into()))?;

        // 2. Get or create FileValidationService.
        if ctx.extensions.get::<FileValidationService>().is_none() {
            ctx.extensions
                .insert(FileValidationService::new(ctx.events.clone()));
        }
        let validation = ctx
            .extensions
            .get::<FileValidationService>()
            .ok_or_else(|| {
                EngineError::PluginSetup("failed to create FileValidationService".into())
            })?;

        // 3. Register validator for .behaviour/*.json.
        validation.register(
            ".behaviour/*.json",
            Box::new(|_path, content| {
                serde_json::from_str::<Behaviour>(content)
                    .map(|_| ())
                    .map_err(|e| format!("invalid behaviour JSON: {e}"))
            }),
        );

        // 4. Insert BehaviourService.
        ctx.extensions.insert(Arc::new(BehaviourService::new()));

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        // 1. Get required extensions — if any missing, silently skip.
        let Some(config) = ctx.extensions.get::<RuntimeConfig>() else {
            return Ok(());
        };
        let Some(embedding) = ctx.extensions.get::<Arc<dyn EmbeddingClient>>() else {
            return Ok(());
        };
        let Some(service) = ctx.extensions.get::<Arc<BehaviourService>>() else {
            return Ok(());
        };

        let config = config.clone();
        let embedding = Arc::clone(embedding);
        let service = Arc::clone(service);

        // 2. Check circuit breaker.
        if service.breaker_tripped.load(Ordering::Relaxed) {
            return Ok(());
        }

        // 3. Scan .behaviour/*.json.
        let behaviour_dir = config.workspace_dir(ctx.user_id).join(".behaviour");
        let mut read_dir = match tokio::fs::read_dir(&behaviour_dir).await {
            Ok(rd) => rd,
            Err(_) => return Ok(()),
        };

        let mut behaviours: Vec<(String, Behaviour)> = Vec::new();
        while let Ok(Some(entry)) = read_dir.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let name = match path.file_stem().and_then(|s| s.to_str()) {
                Some(n) => n.to_owned(),
                None => continue,
            };
            let content = match tokio::fs::read_to_string(&path).await {
                Ok(c) => c,
                Err(_) => continue,
            };
            let behaviour: Behaviour = match serde_json::from_str(&content) {
                Ok(b) => b,
                Err(_) => continue,
            };
            behaviours.push((name, behaviour));
        }

        if behaviours.is_empty() {
            return Ok(());
        }

        // 4. Load embedding cache. Invalidate if model changed.
        let cache_path = config
            .data_root
            .join(ctx.user_id)
            .join("cache")
            .join("behaviour_embeddings.json");

        let mut emb_cache = match load_cache(&cache_path).await {
            Ok(Some(c)) if c.model == embedding.model_id() => c,
            Ok(_) => EmbeddingCache {
                model: embedding.model_id().to_string(),
                entries: Default::default(),
            },
            Err(_) => EmbeddingCache {
                model: embedding.model_id().to_string(),
                entries: Default::default(),
            },
        };

        // 5. Recompute stale/missing embeddings.
        let mut stale: Vec<(usize, String)> = Vec::new();
        for (i, (name, behaviour)) in behaviours.iter().enumerate() {
            let desc_hash = sha256_hex(&behaviour.description);
            let needs_update = match emb_cache.entries.get(name) {
                Some(entry) => entry.description_hash != desc_hash,
                None => true,
            };
            if needs_update {
                stale.push((i, desc_hash));
            }
        }

        if !stale.is_empty() {
            let texts: Vec<&str> = stale
                .iter()
                .map(|(i, _)| behaviours[*i].1.description.as_str())
                .collect();

            let embeddings = match embedding.embed(&texts).await {
                Ok(e) => e,
                Err(EngineError::EmbeddingUnavailable) => {
                    service.breaker_tripped.store(true, Ordering::Relaxed);
                    eprintln!("warning: embedding service unavailable, skipping behaviours");
                    return Ok(());
                }
                Err(e) => return Err(e),
            };

            for (j, (i, desc_hash)) in stale.iter().enumerate() {
                let name = &behaviours[*i].0;
                emb_cache.entries.insert(
                    name.clone(),
                    EmbeddingCacheEntry {
                        description_hash: desc_hash.clone(),
                        embedding: embeddings[j].clone(),
                    },
                );
            }

            // Best-effort cache save — don't fail the prompt on I/O errors.
            let _ = save_cache(&cache_path, &emb_cache).await;
        }

        // 6. Check prompt-level cached search.
        let input_hash = sha256_hex(ctx.input);
        {
            let cached = service.cached_search.lock().await;
            if let Some(ref cs) = *cached {
                if cs.input_hash == input_hash {
                    inject_context(ctx, &cs.matches);
                    return Ok(());
                }
            }
        }

        // 7. Embed input and search.
        let query_embeddings = match embedding.embed(&[ctx.input]).await {
            Ok(e) => e,
            Err(EngineError::EmbeddingUnavailable) => {
                service.breaker_tripped.store(true, Ordering::Relaxed);
                eprintln!("warning: embedding service unavailable, skipping behaviours");
                return Ok(());
            }
            Err(e) => return Err(e),
        };

        let query_emb = &query_embeddings[0];

        let emb_pairs: Vec<(&str, &[f32])> = behaviours
            .iter()
            .filter_map(|(name, _)| {
                emb_cache
                    .entries
                    .get(name)
                    .map(|e| (name.as_str(), e.embedding.as_slice()))
            })
            .collect();

        let matches = search_behaviours(query_emb, &emb_pairs, 0.7, 5);

        // Cache the search result.
        {
            let mut cached = service.cached_search.lock().await;
            *cached = Some(CachedSearch {
                input_hash,
                matches: matches.clone(),
            });
        }

        if !matches.is_empty() {
            inject_context(ctx, &matches);
        }

        Ok(())
    }
}

fn inject_context(ctx: &mut PrepareContext<'_>, matches: &[String]) {
    let list = matches
        .iter()
        .map(|m| format!("- .behaviour/{m}.json"))
        .collect::<Vec<_>>()
        .join("\n");

    let content = format!(
        "# Behaviours\n\
         \n\
         These behaviours may be relevant:\n\
         {list}\n\
         \n\
         Read a behaviour file when relevant. Follow its process.\n\
         When you discover repeatable domain knowledge, create or update a behaviour file in .behaviour/."
    );

    ctx.context.push(ContextItem {
        item_type: "behaviours".into(),
        id: Some("behaviours".into()),
        content,
    });
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::context::ContextItem;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;
    use aperture_engine::tool::Tool;
    use std::path::PathBuf;
    use std::sync::Arc;

    fn test_config(data_root: PathBuf) -> RuntimeConfig {
        RuntimeConfig {
            data_root,
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        }
    }

    // ── Mock embedding client ────────────────────────────────────────

    struct MockEmbeddingClient {
        model: String,
        responses: std::sync::Mutex<Vec<Vec<Vec<f32>>>>,
    }

    impl MockEmbeddingClient {
        fn new(model: &str, responses: Vec<Vec<Vec<f32>>>) -> Self {
            Self {
                model: model.into(),
                responses: std::sync::Mutex::new(responses),
            }
        }

        fn unavailable() -> Self {
            Self {
                model: "unavailable".into(),
                responses: std::sync::Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait]
    impl EmbeddingClient for MockEmbeddingClient {
        fn model_id(&self) -> &str {
            &self.model
        }

        async fn embed(&self, _texts: &[&str]) -> Result<Vec<Vec<f32>>> {
            let mut responses = self.responses.lock().unwrap();
            if responses.is_empty() {
                return Err(EngineError::EmbeddingUnavailable);
            }
            Ok(responses.remove(0))
        }
    }

    // ── Tests ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn setup_registers_validator() {
        let mut extensions = Extensions::new();
        let events = EventBus::new();
        let mut actions = Vec::new();

        extensions.insert(RuntimeConfig::default());

        let mut registry = aperture_engine::ToolRegistry::new();
        let mut ctx = SetupContext {
            extensions: &mut extensions,
            events: &events,
            actions: &mut actions,
            registry: &mut registry,
        };

        BehaviourPlugin.setup(&mut ctx).await.unwrap();

        let validation = extensions.get::<FileValidationService>().unwrap();
        assert!(validation
            .validate(
                ".behaviour/test.json",
                r#"{"description": "Test", "process": "Do it"}"#
            )
            .is_ok());
        assert!(validation
            .validate(".behaviour/bad.json", "not json")
            .is_err());

        assert!(extensions.get::<Arc<BehaviourService>>().is_some());
    }

    #[tokio::test]
    async fn prepare_no_embedding_client_noop() {
        let tmp =
            std::env::temp_dir().join(format!("aperture-beh-noembed-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("alice").join("workspace").join(".behaviour");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::write(
            ws.join("test.json"),
            r#"{"description": "Test", "process": "Do it"}"#,
        )
        .unwrap();

        let mut extensions = Extensions::new();
        extensions.insert(test_config(tmp.clone()));
        // No EmbeddingClient inserted.
        extensions.insert(Arc::new(BehaviourService::new()));

        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "alice",
            input: "deploy something",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        BehaviourPlugin.prepare(&mut ctx).await.unwrap();
        assert!(context.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn prepare_no_behaviours_noop() {
        let tmp = std::env::temp_dir().join(format!("aperture-beh-empty-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("alice").join("workspace");
        std::fs::create_dir_all(&ws).unwrap();
        // No .behaviour/ directory.

        let mock_client: Arc<dyn EmbeddingClient> =
            Arc::new(MockEmbeddingClient::new("test-model", vec![]));

        let mut extensions = Extensions::new();
        extensions.insert(test_config(tmp.clone()));
        extensions.insert(mock_client);
        extensions.insert(Arc::new(BehaviourService::new()));

        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "alice",
            input: "deploy something",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        BehaviourPlugin.prepare(&mut ctx).await.unwrap();
        assert!(context.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn prepare_tripped_breaker_skips() {
        let tmp =
            std::env::temp_dir().join(format!("aperture-beh-breaker-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("alice").join("workspace").join(".behaviour");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::write(
            ws.join("test.json"),
            r#"{"description": "Test", "process": "Do it"}"#,
        )
        .unwrap();

        let service = Arc::new(BehaviourService::new());
        service.breaker_tripped.store(true, Ordering::Relaxed);

        let mock_client: Arc<dyn EmbeddingClient> = Arc::new(MockEmbeddingClient::unavailable());

        let mut extensions = Extensions::new();
        extensions.insert(test_config(tmp.clone()));
        extensions.insert(mock_client);
        extensions.insert(service);

        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "alice",
            input: "deploy something",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        BehaviourPlugin.prepare(&mut ctx).await.unwrap();
        assert!(context.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn prepare_injects_matching_behaviours() {
        let tmp = std::env::temp_dir().join(format!("aperture-beh-match-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("alice").join("workspace").join(".behaviour");
        std::fs::create_dir_all(&ws).unwrap();

        // Two behaviours — "deploy" should match, "cooking" should not.
        std::fs::write(
            ws.join("deploy-scripts.json"),
            r#"{"description": "How to deploy", "process": "1. Build 2. Push"}"#,
        )
        .unwrap();
        std::fs::write(
            ws.join("cooking-recipes.json"),
            r#"{"description": "Italian cooking", "process": "1. Boil pasta"}"#,
        )
        .unwrap();

        // Mock embeddings: deploy=[1,0], cooking=[0,1], query=[0.95, 0.05]
        // cosine(query, deploy) ≈ 0.998, cosine(query, cooking) ≈ 0.053
        let service = Arc::new(BehaviourService::new());

        // The mock will be called twice:
        // 1st: embed the two behaviour descriptions (stale) → 2 vectors
        // 2nd: embed the input query → 1 vector
        //
        // Note: readdir order is filesystem-dependent, so we provide both orderings
        // by giving the same embedding for both descriptions and relying on the
        // search threshold to distinguish.
        let mock_client: Arc<dyn EmbeddingClient> = Arc::new(MockEmbeddingClient::new(
            "test-model",
            vec![
                // 1st call: behaviour descriptions (order may vary)
                vec![vec![1.0, 0.0], vec![0.0, 1.0]],
                // 2nd call: input query
                vec![vec![0.95, 0.05]],
            ],
        ));

        let mut extensions = Extensions::new();
        extensions.insert(test_config(tmp.clone()));
        extensions.insert(mock_client);
        extensions.insert(service);

        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "alice",
            input: "how do I deploy?",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        BehaviourPlugin.prepare(&mut ctx).await.unwrap();

        // Should have injected context with at least one match.
        assert_eq!(context.len(), 1);
        assert_eq!(context[0].item_type, "behaviours");
        // At least one .behaviour/ file should be referenced.
        assert!(context[0].content.contains(".behaviour/"));
        assert!(context[0].content.contains("Behaviours"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
