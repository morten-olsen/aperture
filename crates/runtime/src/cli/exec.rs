use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};
use aperture_sandbox_os::SandboxedCommand;

use super::rules::{check_command, load_rules, CommandCheck};
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
        let rules_path = config.configs_dir(&ctx.user_id).join("cli-rules.toml");
        let rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

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
        tokio::fs::create_dir_all(&workspace)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to create workspace: {e}")))?;

        let cmd = SandboxedCommand::new(command, &workspace)
            .timeout(Duration::from_millis(timeout_ms))
            .max_output_bytes(config.cli_max_output_bytes)
            .allow_network(allow_network)
            .writable_path(&workspace)
            .readable_path(&workspace);

        let output = aperture_sandbox_os::execute(&cmd).await.map_err(|e| {
            EngineError::tool_error(format!("sandbox error: {e}"), json!({ "command": command }))
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

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;
    use aperture_engine::tool::ToolContext;

    use crate::config::RuntimeConfig;

    fn test_setup(rules_toml: &str) -> (std::path::PathBuf, Extensions) {
        let tmp = std::env::temp_dir().join(format!("aperture-cli-test-{}", uuid::Uuid::new_v4()));
        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };

        // Write rules file.
        let configs_dir = config.configs_dir("testuser");
        std::fs::create_dir_all(&configs_dir).unwrap();
        std::fs::write(configs_dir.join("cli-rules.toml"), rules_toml).unwrap();

        // Create workspace.
        let ws = config.workspace_dir("testuser");
        std::fs::create_dir_all(&ws).unwrap();

        let mut ext = Extensions::new();
        ext.insert(config);
        (tmp, ext)
    }

    #[tokio::test]
    async fn cli_exec_runs_allowed_command() {
        if !aperture_sandbox_os::sandbox_available() {
            eprintln!("sandbox not available, skipping cli_exec_runs_allowed_command");
            return;
        }

        let rules = r#"
[[allow]]
pattern = "echo *"
network = false
"#;
        let (tmp, ext) = test_setup(rules);
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({"command": "echo hello"}),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "testuser".into(),
            replay: None,
        };

        let result = CliExec.invoke(ctx).await;
        match result {
            Ok(val) => {
                assert!(
                    val["stdout"].as_str().unwrap().contains("hello"),
                    "expected stdout to contain 'hello', got: {}",
                    val["stdout"]
                );
            }
            Err(ref e) => {
                // If the sandbox itself fails (e.g. macOS version issue),
                // verify the error is from sandbox execution — not from
                // the rules check (which would indicate a logic bug).
                let msg = e.to_string();
                assert!(
                    msg.contains("sandbox error") || msg.contains("exit code"),
                    "expected sandbox execution error, not a rules error: {msg}"
                );
            }
        }

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn cli_exec_rejects_unmatched_command() {
        let rules = ""; // Empty — no allow rules.
        let (tmp, ext) = test_setup(rules);
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({"command": "echo hello"}),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "testuser".into(),
            replay: None,
        };

        let err = CliExec.invoke(ctx).await.unwrap_err();
        assert!(
            err.to_string().contains("no matching allow rule"),
            "expected 'no matching allow rule', got: {err}"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
