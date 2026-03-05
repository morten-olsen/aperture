use async_trait::async_trait;

use aperture_engine::context::ContextItem;
use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext};

use crate::config::RuntimeConfig;

/// Plugin that injects available `.skills/*.md` filenames into prompt context
/// so the agent can read relevant skills and create new ones.
pub struct SkillsPlugin;

#[async_trait]
impl Plugin for SkillsPlugin {
    fn id(&self) -> &str {
        "skills"
    }

    fn description(&self) -> &str {
        "Injects available skill names from .skills/ into prompt context"
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        let Some(config) = ctx.extensions.get::<RuntimeConfig>() else {
            return Ok(());
        };

        let skills_dir = config.workspace_dir(ctx.user_id).join(".skills");

        let mut read_dir = match tokio::fs::read_dir(&skills_dir).await {
            Ok(rd) => rd,
            Err(_) => return Ok(()),
        };

        let mut names = Vec::new();
        while let Ok(Some(entry)) = read_dir.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    names.push(stem.to_owned());
                }
            }
        }

        if names.is_empty() {
            return Ok(());
        }

        names.sort();

        let list = names
            .iter()
            .map(|n| format!("- {n}"))
            .collect::<Vec<_>>()
            .join("\n");

        let content = format!(
            "# Skills\n\
             \n\
             The following skills are available in `.skills/`:\n\
             {list}\n\
             \n\
             Read a skill file (e.g. `.skills/{}.md`) when it is relevant to the user's request.\n\
             When you discover specialized, repeatable domain knowledge during a task, \
             create or update a skill file to capture it for future sessions.",
            names[0],
        );

        ctx.context.push(ContextItem {
            item_type: "skills".into(),
            id: Some("skills".into()),
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

    fn make_ctx<'a>(
        user_id: &'a str,
        tools: &'a mut Vec<Tool>,
        context: &'a mut Vec<ContextItem>,
        state: &'a mut State,
        extensions: &'a Extensions,
        events: &'a EventBus,
        registry: &'a aperture_engine::ToolRegistry,
    ) -> PrepareContext<'a> {
        PrepareContext {
            user_id,
            input: "",
            tools,
            context,
            state,
            extensions,
            events,
            history: &[],
            registry,
        }
    }

    #[tokio::test]
    async fn injects_skills_when_directory_has_files() {
        let tmp = std::env::temp_dir().join("aperture-skills-test-present");
        let skills_dir = tmp.join("alice").join("workspace").join(".skills");
        std::fs::create_dir_all(&skills_dir).unwrap();
        std::fs::write(skills_dir.join("deploy-scripts.md"), "# Deploy").unwrap();
        std::fs::write(skills_dir.join("postgres-workflows.md"), "# PG").unwrap();

        let extensions = test_extensions(tmp.clone());
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = make_ctx(
            "alice",
            &mut tools,
            &mut context,
            &mut state,
            &extensions,
            &events,
            &registry,
        );
        SkillsPlugin.prepare(&mut ctx).await.unwrap();

        assert_eq!(context.len(), 1);
        assert_eq!(context[0].item_type, "skills");
        assert_eq!(context[0].id.as_deref(), Some("skills"));
        assert!(context[0].content.contains("- deploy-scripts"));
        assert!(context[0].content.contains("- postgres-workflows"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn no_context_when_directory_missing() {
        let tmp = std::env::temp_dir().join("aperture-skills-test-missing");
        let workspace = tmp.join("bob").join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        let extensions = test_extensions(tmp.clone());
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = make_ctx(
            "bob",
            &mut tools,
            &mut context,
            &mut state,
            &extensions,
            &events,
            &registry,
        );
        SkillsPlugin.prepare(&mut ctx).await.unwrap();

        assert!(context.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn no_context_when_directory_empty() {
        let tmp = std::env::temp_dir().join("aperture-skills-test-empty");
        let skills_dir = tmp.join("carol").join("workspace").join(".skills");
        std::fs::create_dir_all(&skills_dir).unwrap();

        let extensions = test_extensions(tmp.clone());
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = make_ctx(
            "carol",
            &mut tools,
            &mut context,
            &mut state,
            &extensions,
            &events,
            &registry,
        );
        SkillsPlugin.prepare(&mut ctx).await.unwrap();

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
        let mut ctx = make_ctx(
            "alice",
            &mut tools,
            &mut context,
            &mut state,
            &extensions,
            &events,
            &registry,
        );
        SkillsPlugin.prepare(&mut ctx).await.unwrap();

        assert!(context.is_empty());
    }

    #[tokio::test]
    async fn non_md_files_ignored() {
        let tmp = std::env::temp_dir().join("aperture-skills-test-nonmd");
        let skills_dir = tmp.join("dave").join("workspace").join(".skills");
        std::fs::create_dir_all(&skills_dir).unwrap();
        std::fs::write(skills_dir.join("valid-skill.md"), "# Valid").unwrap();
        std::fs::write(skills_dir.join("notes.txt"), "not a skill").unwrap();
        std::fs::write(skills_dir.join("data.json"), "{}").unwrap();

        let extensions = test_extensions(tmp.clone());
        let events = EventBus::new();
        let mut state = State::new();
        let mut tools: Vec<Tool> = Vec::new();
        let mut context: Vec<ContextItem> = Vec::new();

        let registry = aperture_engine::ToolRegistry::new();
        let mut ctx = make_ctx(
            "dave",
            &mut tools,
            &mut context,
            &mut state,
            &extensions,
            &events,
            &registry,
        );
        SkillsPlugin.prepare(&mut ctx).await.unwrap();

        assert_eq!(context.len(), 1);
        assert!(context[0].content.contains("- valid-skill"));
        assert!(!context[0].content.contains("notes"));
        assert!(!context[0].content.contains("data"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
