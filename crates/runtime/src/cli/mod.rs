mod exec;
mod rules;
mod rules_tools;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext};
use aperture_engine::tool::{ApprovalRequirement, Tool};

use self::exec::CliExec;
use self::rules::{check_command, load_rules, CommandCheck};
use self::rules_tools::{CliRulesAdd, CliRulesList, CliRulesRemove};
use crate::config::RuntimeConfig;

pub struct CliPlugin;

#[async_trait]
impl Plugin for CliPlugin {
    fn id(&self) -> &str {
        "cli"
    }

    fn description(&self) -> &str {
        "Provides sandboxed CLI command execution with configurable allow/deny rules"
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        // Capture a clone of RuntimeConfig for the approval closure.
        let config = ctx.extensions.get::<RuntimeConfig>().cloned();

        ctx.tools.push(Tool {
            id: "cli_exec".into(),
            description: "Execute a shell command in the user's workspace sandbox. \
                          The command runs with filesystem access limited to the workspace \
                          and network access determined by CLI rules."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "Timeout in milliseconds (optional, defaults to 30000)"
                    }
                },
                "required": ["command"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "stdout": { "type": "string" },
                    "stderr": { "type": "string" },
                    "exit_code": { "type": "integer" }
                }
            })),
            require_approval: Some(ApprovalRequirement::Dynamic(Box::new(
                move |input, approval_ctx| {
                    let command = match input.get("command").and_then(|v| v.as_str()) {
                        Some(cmd) => cmd,
                        None => return Some("missing command".into()),
                    };

                    let config = match &config {
                        Some(c) => c,
                        None => return Some("runtime config not available".into()),
                    };

                    let rules_path = config
                        .configs_dir(approval_ctx.user_id)
                        .join("cli-rules.toml");

                    let rules = match load_rules(&rules_path) {
                        Ok(r) => r,
                        Err(_) => {
                            return Some(format!(
                                "Command \"{command}\" has no matching allow rule"
                            ))
                        }
                    };

                    match check_command(&rules, command) {
                        CommandCheck::Allowed { .. } => None,
                        CommandCheck::Denied { pattern } => {
                            Some(format!("BLOCKED: matches deny rule \"{pattern}\""))
                        }
                        CommandCheck::Unmatched => {
                            Some(format!("Command \"{command}\" has no matching allow rule"))
                        }
                    }
                },
            ))),
            invoke: Box::new(CliExec),
        });

        // Rules management tools — always require human approval.
        ctx.tools.push(Tool {
            id: "cli_rules_list".into(),
            description: "List all CLI allow/deny rules for the current user.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Listing CLI rules requires approval".into(),
            }),
            invoke: Box::new(CliRulesList),
        });

        ctx.tools.push(Tool {
            id: "cli_rules_add".into(),
            description: "Add a new CLI allow or deny rule.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern to match commands against"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["allow", "deny"],
                        "description": "Whether to allow or deny matching commands (default: allow)"
                    },
                    "network": {
                        "type": "boolean",
                        "description": "Whether to allow network access for matching commands (only for allow rules)"
                    }
                },
                "required": ["pattern"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Adding CLI rules requires approval".into(),
            }),
            invoke: Box::new(CliRulesAdd),
        });

        ctx.tools.push(Tool {
            id: "cli_rules_remove".into(),
            description: "Remove a CLI rule by its exact pattern.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "The exact pattern of the rule to remove"
                    }
                },
                "required": ["pattern"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Removing CLI rules requires approval".into(),
            }),
            invoke: Box::new(CliRulesRemove),
        });

        Ok(())
    }
}
