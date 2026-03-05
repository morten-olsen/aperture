use async_trait::async_trait;

use aperture_engine::context::ContextItem;
use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext};

use crate::config::RuntimeConfig;

/// Plugin that injects the contents of `AGENTS.md` from the workspace root
/// as prompt context, if the file exists.
pub struct AgentsMdPlugin;

#[async_trait]
impl Plugin for AgentsMdPlugin {
    fn id(&self) -> &str {
        "agents-md"
    }

    fn description(&self) -> &str {
        "Injects AGENTS.md from the workspace root as prompt context"
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        let Some(config) = ctx.extensions.get::<RuntimeConfig>() else {
            return Ok(());
        };

        let agents_md_path = config.workspace_dir(ctx.user_id).join("AGENTS.md");

        let content = match tokio::fs::read_to_string(&agents_md_path).await {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };

        if content.is_empty() {
            return Ok(());
        }

        ctx.context.push(ContextItem {
            item_type: "agents_md".into(),
            id: Some("agents_md".into()),
            content,
        });

        Ok(())
    }
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

    fn test_extensions(data_root: PathBuf) -> Extensions {
        let mut ext = Extensions::new();
        ext.insert(RuntimeConfig {
            data_root,
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        });
        ext
    }

    #[tokio::test]
    async fn injects_agents_md_when_present() {
        let tmp = std::env::temp_dir().join("aperture-agents-md-test-present");
        let workspace = tmp.join("alice").join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(workspace.join("AGENTS.md"), "# My Agent\nBe helpful.").unwrap();

        let extensions = test_extensions(tmp.clone());
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "alice",
            input: "",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        AgentsMdPlugin.prepare(&mut ctx).await.unwrap();

        assert_eq!(context.len(), 1);
        assert_eq!(context[0].item_type, "agents_md");
        assert_eq!(context[0].content, "# My Agent\nBe helpful.");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn no_context_when_file_missing() {
        let tmp = std::env::temp_dir().join("aperture-agents-md-test-missing");
        let workspace = tmp.join("bob").join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        let extensions = test_extensions(tmp.clone());
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "bob",
            input: "",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        AgentsMdPlugin.prepare(&mut ctx).await.unwrap();

        assert!(context.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn no_context_when_no_runtime_config() {
        let extensions = Extensions::new();
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = PrepareContext {
            user_id: "alice",
            input: "",
            tools: &mut tools,
            context: &mut context,
            state: &mut state,
            extensions: &extensions,
            events: &events,
            history: &[],
            registry: &registry,
        };

        AgentsMdPlugin.prepare(&mut ctx).await.unwrap();

        assert!(context.is_empty());
    }
}
