mod rules;
mod rules_tools;

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;
use sha2::{Digest, Sha256};

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};
use aperture_engine::sandbox::ScriptResolver;
use aperture_engine::tool::{ApprovalRequirement, Tool};

use self::rules::{check_script, load_script_rules};
use self::rules_tools::{ScriptRulesAdd, ScriptRulesList, ScriptRulesRemove};
use crate::config::RuntimeConfig;
use crate::workspace::resolve_sandboxed_path;

/// Runtime implementation of `ScriptResolver`.
struct RuntimeScriptResolver {
    config: RuntimeConfig,
}

impl ScriptResolver for RuntimeScriptResolver {
    fn read_script(&self, user_id: &str, path: &str) -> std::result::Result<String, String> {
        let resolved =
            resolve_sandboxed_path(&self.config, user_id, path).map_err(|e| e.to_string())?;
        std::fs::read_to_string(&resolved).map_err(|e| format!("failed to read script: {e}"))
    }

    fn is_approved(&self, user_id: &str, path: &str, content: &str) -> bool {
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let rules_path = self.config.configs_dir(user_id).join("script-rules.toml");
        let rules = load_script_rules(&rules_path).unwrap_or_default();
        check_script(&rules, path, &hash)
    }
}

const SCRIPT_TOOL_IDS: &[&str] = &[
    "script_rules_list",
    "script_rules_add",
    "script_rules_remove",
];

/// Plugin that provides script approval management and the `ScriptResolver`
/// extension for the sandbox-code crate.
pub struct ScriptPlugin;

#[async_trait]
impl Plugin for ScriptPlugin {
    fn id(&self) -> &str {
        "script"
    }

    fn description(&self) -> &str {
        "Provides script approval rules and resolution for the code sandbox"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        let config = ctx
            .extensions
            .get::<RuntimeConfig>()
            .cloned()
            .unwrap_or_default();

        ctx.extensions
            .insert(Box::new(RuntimeScriptResolver { config }) as Box<dyn ScriptResolver>);

        ctx.registry.register(Tool {
            id: "script_rules_list".into(),
            description: "List all approved scripts with their paths and SHA-256 checksums.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Listing script rules requires approval".into(),
            }),
            invoke: Arc::new(ScriptRulesList),
        });

        ctx.registry.register(Tool {
            id: "script_rules_add".into(),
            description: "Approve a workspace script by path. Reads the file and captures its \
                          SHA-256 checksum. The approval is invalidated if the file changes."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative path to the script file"
                    }
                },
                "required": ["path"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Adding script approval requires approval".into(),
            }),
            invoke: Arc::new(ScriptRulesAdd),
        });

        ctx.registry.register(Tool {
            id: "script_rules_remove".into(),
            description: "Remove a script approval by path.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative path of the script to un-approve"
                    }
                },
                "required": ["path"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Removing script approval requires approval".into(),
            }),
            invoke: Arc::new(ScriptRulesRemove),
        });

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        for id in SCRIPT_TOOL_IDS {
            ctx.activate_tool(id)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolver_is_approved_matches_hash() {
        let tmp = std::env::temp_dir().join("aperture-script-resolver-test");
        let user_ws = tmp.join("testuser").join("workspace").join("scripts");
        let user_configs = tmp.join("testuser").join("configs");
        std::fs::create_dir_all(&user_ws).unwrap();
        std::fs::create_dir_all(&user_configs).unwrap();

        // Write a script file.
        let script_content = "console.log('hello')";
        std::fs::write(user_ws.join("test.js"), script_content).unwrap();

        // Compute expected hash.
        let expected_hash = format!("{:x}", Sha256::digest(script_content.as_bytes()));

        // Write a matching script-rules.toml.
        let rules = rules::ScriptRulesFile {
            allow: vec![rules::ScriptAllowEntry {
                path: "scripts/test.js".into(),
                sha256: expected_hash.clone(),
            }],
        };
        rules::save_script_rules(&user_configs.join("script-rules.toml"), &rules).unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };

        let resolver = RuntimeScriptResolver { config };

        // Read the script.
        let content = resolver.read_script("testuser", "scripts/test.js").unwrap();
        assert_eq!(content, script_content);

        // Should be approved.
        assert!(resolver.is_approved("testuser", "scripts/test.js", &content));

        // Modified content should not be approved.
        assert!(!resolver.is_approved("testuser", "scripts/test.js", "modified content"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn resolver_read_script_rejects_traversal() {
        let tmp = std::env::temp_dir().join("aperture-script-resolver-traversal");
        let user_ws = tmp.join("testuser").join("workspace");
        std::fs::create_dir_all(&user_ws).unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };

        let resolver = RuntimeScriptResolver { config };

        let err = resolver
            .read_script("testuser", "../../../etc/passwd")
            .unwrap_err();
        assert!(err.contains(".."));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
