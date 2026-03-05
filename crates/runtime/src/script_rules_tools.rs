use async_trait::async_trait;
use sha2::{Digest, Sha256};
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};

use crate::config::RuntimeConfig;
use crate::script_rules::{ScriptAllowEntry, load_script_rules, save_script_rules};
use crate::workspace::resolve_sandboxed_path;

fn get_config<'a>(ctx: &'a ToolContext<'a>) -> Result<&'a RuntimeConfig> {
    ctx.extensions.get::<RuntimeConfig>().ok_or_else(|| {
        EngineError::ToolInvocation("RuntimeConfig not found in extensions".into())
    })
}

// ── script_rules_list ──────────────────────────────────────────────

pub struct ScriptRulesList;

#[async_trait]
impl ToolInvoke for ScriptRulesList {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("script-rules.toml");
        let rules = load_script_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let entries: Vec<Value> = rules
            .allow
            .iter()
            .map(|e| {
                json!({
                    "path": e.path,
                    "sha256": e.sha256,
                })
            })
            .collect();

        Ok(json!({ "allow": entries }))
    }
}

// ── script_rules_add ───────────────────────────────────────────────

pub struct ScriptRulesAdd;

#[async_trait]
impl ToolInvoke for ScriptRulesAdd {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = ctx
            .input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: path".into()))?
            .to_string();

        // Read the script file to compute its SHA-256.
        let resolved = resolve_sandboxed_path(config, &ctx.user_id, &rel_path)?;
        let content = std::fs::read_to_string(&resolved)
            .map_err(|e| EngineError::ToolInvocation(format!("failed to read script: {e}")))?;

        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));

        // Load existing rules, upsert entry, save.
        let rules_path = config.configs_dir(&ctx.user_id).join("script-rules.toml");
        let mut rules = load_script_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        // Remove any existing entry for this path (upsert).
        rules.allow.retain(|e| e.path != rel_path);
        rules.allow.push(ScriptAllowEntry {
            path: rel_path.clone(),
            sha256: hash.clone(),
        });

        save_script_rules(&rules_path, &rules).map_err(EngineError::ToolInvocation)?;

        Ok(json!({ "approved": rel_path, "sha256": hash }))
    }
}

// ── script_rules_remove ────────────────────────────────────────────

pub struct ScriptRulesRemove;

#[async_trait]
impl ToolInvoke for ScriptRulesRemove {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = ctx
            .input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: path".into()))?;

        let rules_path = config.configs_dir(&ctx.user_id).join("script-rules.toml");
        let mut rules = load_script_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let before = rules.allow.len();
        rules.allow.retain(|e| e.path != rel_path);
        let removed = before - rules.allow.len();

        save_script_rules(&rules_path, &rules).map_err(EngineError::ToolInvocation)?;

        Ok(json!({ "removed": removed, "path": rel_path }))
    }
}
