use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};
use aperture_sandbox_os::SandboxedCommand;

use crate::cli_rules::{check_command, load_rules, CommandCheck};
use crate::config::RuntimeConfig;

pub struct CliExec;

#[async_trait]
impl ToolInvoke for CliExec {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = ctx.extensions.get::<RuntimeConfig>().ok_or_else(|| {
            EngineError::ToolInvocation("RuntimeConfig not found in extensions".into())
        })?;

        let command = ctx
            .input
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: command".into()))?;

        let timeout_ms = ctx
            .input
            .get("timeout")
            .and_then(|v| v.as_u64())
            .unwrap_or(config.cli_timeout_ms);

        // Load and check CLI rules.
        let rules_path = config
            .configs_dir(&ctx.user_id)
            .join("cli-rules.toml");
        let rules = load_rules(&rules_path)
            .map_err(EngineError::ToolInvocation)?;

        let check = check_command(&rules, command);

        // Hard-reject denied commands even if somehow approved.
        if let CommandCheck::Denied { pattern } = &check {
            return Err(EngineError::tool_error(
                format!("command blocked by deny rule: \"{pattern}\""),
                json!({ "command": command, "pattern": pattern }),
            ));
        }

        // Unmatched commands should have been caught by the approval gate,
        // but if we're here, hard-reject as well.
        if check == CommandCheck::Unmatched {
            return Err(EngineError::tool_error(
                "command has no matching allow rule",
                json!({ "command": command }),
            ));
        }

        let allow_network = matches!(check, CommandCheck::Allowed { network: true });

        let workspace = config.workspace_dir(&ctx.user_id);

        // Ensure workspace exists.
        tokio::fs::create_dir_all(&workspace).await.map_err(|e| {
            EngineError::ToolInvocation(format!("failed to create workspace: {e}"))
        })?;

        let cmd = SandboxedCommand::new(command, &workspace)
            .timeout(Duration::from_millis(timeout_ms))
            .max_output_bytes(config.cli_max_output_bytes)
            .allow_network(allow_network)
            .writable_path(&workspace)
            .readable_path(&workspace);

        let output = aperture_sandbox_os::execute(&cmd).await.map_err(|e| {
            EngineError::tool_error(
                format!("sandbox error: {e}"),
                json!({ "command": command }),
            )
        })?;

        if output.exit_code != 0 {
            return Err(EngineError::tool_error(
                format!("command failed with exit code {}", output.exit_code),
                json!({
                    "stdout": output.stdout,
                    "stderr": output.stderr,
                    "exit_code": output.exit_code,
                    "command": command,
                }),
            ));
        }

        Ok(json!({
            "stdout": output.stdout,
            "stderr": output.stderr,
            "exit_code": output.exit_code,
        }))
    }
}
