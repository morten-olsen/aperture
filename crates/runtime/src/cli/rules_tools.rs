use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};

use super::rules::{load_rules, save_rules, AllowEntry, DenyEntry};
use crate::config::RuntimeConfig;

fn get_config<'a>(ctx: &'a ToolContext<'a>) -> Result<&'a RuntimeConfig> {
    ctx.extensions
        .get::<RuntimeConfig>()
        .ok_or_else(|| EngineError::ToolInvocation("RuntimeConfig not found in extensions".into()))
}

// ── cli_rules_list ──────────────────────────────────────────────────

pub struct CliRulesList;

#[async_trait]
impl ToolInvoke for CliRulesList {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("cli-rules.toml");
        let rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let allow: Vec<Value> = rules
            .allow
            .iter()
            .map(|a| {
                json!({
                    "pattern": a.pattern,
                    "network": a.network,
                    "action": "allow",
                })
            })
            .collect();

        let deny: Vec<Value> = rules
            .deny
            .iter()
            .map(|d| {
                json!({
                    "pattern": d.pattern,
                    "action": "deny",
                })
            })
            .collect();

        Ok(json!({
            "allow": allow,
            "deny": deny,
        }))
    }
}

// ── cli_rules_add ───────────────────────────────────────────────────

pub struct CliRulesAdd;

#[async_trait]
impl ToolInvoke for CliRulesAdd {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("cli-rules.toml");
        let mut rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let pattern = ctx
            .input
            .get("pattern")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: pattern".into()))?
            .to_string();

        let action = ctx
            .input
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("allow");

        match action {
            "allow" => {
                let network = ctx
                    .input
                    .get("network")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                rules.allow.push(AllowEntry {
                    pattern: pattern.clone(),
                    network,
                });
            }
            "deny" => {
                rules.deny.push(DenyEntry {
                    pattern: pattern.clone(),
                });
            }
            other => {
                return Err(EngineError::ToolInvocation(format!(
                    "invalid action: {other} (expected 'allow' or 'deny')"
                )));
            }
        }

        save_rules(&rules_path, &rules).map_err(EngineError::ToolInvocation)?;

        Ok(json!({ "added": pattern, "action": action }))
    }
}

// ── cli_rules_remove ────────────────────────────────────────────────

pub struct CliRulesRemove;

#[async_trait]
impl ToolInvoke for CliRulesRemove {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("cli-rules.toml");
        let mut rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let pattern = ctx
            .input
            .get("pattern")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: pattern".into()))?;

        let before_allow = rules.allow.len();
        let before_deny = rules.deny.len();

        rules.allow.retain(|a| a.pattern != pattern);
        rules.deny.retain(|d| d.pattern != pattern);

        let removed = (before_allow - rules.allow.len()) + (before_deny - rules.deny.len());

        save_rules(&rules_path, &rules).map_err(EngineError::ToolInvocation)?;

        Ok(json!({ "removed": removed, "pattern": pattern }))
    }
}
