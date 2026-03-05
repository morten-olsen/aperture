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

// ── web_rules_list ─────────────────────────────────────────────────

pub struct WebRulesList;

#[async_trait]
impl ToolInvoke for WebRulesList {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("web-rules.toml");
        let rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let allow: Vec<Value> = rules
            .allow
            .iter()
            .map(|a| {
                json!({
                    "domain": a.domain,
                    "action": "allow",
                })
            })
            .collect();

        let deny: Vec<Value> = rules
            .deny
            .iter()
            .map(|d| {
                json!({
                    "domain": d.domain,
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

// ── web_rules_add ──────────────────────────────────────────────────

pub struct WebRulesAdd;

#[async_trait]
impl ToolInvoke for WebRulesAdd {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("web-rules.toml");
        let mut rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let domain = ctx
            .input
            .get("domain")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: domain".into()))?
            .to_string();

        let action = ctx
            .input
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("allow");

        match action {
            "allow" => {
                rules.allow.push(AllowEntry {
                    domain: domain.clone(),
                });
            }
            "deny" => {
                rules.deny.push(DenyEntry {
                    domain: domain.clone(),
                });
            }
            other => {
                return Err(EngineError::ToolInvocation(format!(
                    "invalid action: {other} (expected 'allow' or 'deny')"
                )));
            }
        }

        save_rules(&rules_path, &rules).map_err(EngineError::ToolInvocation)?;

        Ok(json!({ "added": domain, "action": action }))
    }
}

// ── web_rules_remove ───────────────────────────────────────────────

pub struct WebRulesRemove;

#[async_trait]
impl ToolInvoke for WebRulesRemove {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rules_path = config.configs_dir(&ctx.user_id).join("web-rules.toml");
        let mut rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        let domain = ctx
            .input
            .get("domain")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: domain".into()))?;

        let before_allow = rules.allow.len();
        let before_deny = rules.deny.len();

        rules.allow.retain(|a| a.domain != domain);
        rules.deny.retain(|d| d.domain != domain);

        let removed = (before_allow - rules.allow.len()) + (before_deny - rules.deny.len());

        save_rules(&rules_path, &rules).map_err(EngineError::ToolInvocation)?;

        Ok(json!({ "removed": removed, "domain": domain }))
    }
}
