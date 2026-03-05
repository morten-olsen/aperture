mod command;
mod error;
mod execute;
mod output;
mod platform;

pub use command::SandboxedCommand;
pub use error::{Result, SandboxError};
pub use output::CommandOutput;

/// Execute a command inside an OS-native sandbox.
pub async fn execute(cmd: &SandboxedCommand) -> Result<CommandOutput> {
    execute::execute(cmd).await
}

/// Check whether OS-native sandboxing is available on the current platform.
pub fn sandbox_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::path::Path::new("/usr/bin/sandbox-exec").exists()
    }
    #[cfg(target_os = "linux")]
    {
        use landlock::{Access, AccessFs, Ruleset, RulesetAttr, ABI};
        // Probe Landlock support by attempting to create a minimal ruleset.
        Ruleset::default()
            .handle_access(AccessFs::from_all(ABI::V4))
            .and_then(|rs| rs.create())
            .is_ok()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn simple_echo_command() {
        if !sandbox_available() {
            eprintln!("skipping: sandbox not available");
            return;
        }

        let cmd = SandboxedCommand::new("echo hello", std::env::temp_dir())
            .readable_path("/")
            .timeout(Duration::from_secs(10));

        let output = execute(&cmd).await.unwrap();
        assert_eq!(output.exit_code, 0);
        assert_eq!(output.stdout.trim(), "hello");
    }

    #[tokio::test]
    async fn command_exit_code() {
        if !sandbox_available() {
            eprintln!("skipping: sandbox not available");
            return;
        }

        let cmd = SandboxedCommand::new("exit 42", std::env::temp_dir())
            .readable_path("/")
            .timeout(Duration::from_secs(10));

        let output = execute(&cmd).await.unwrap();
        assert_eq!(output.exit_code, 42);
    }

    #[tokio::test]
    async fn command_timeout() {
        if !sandbox_available() {
            eprintln!("skipping: sandbox not available");
            return;
        }

        let cmd = SandboxedCommand::new("sleep 60", std::env::temp_dir())
            .readable_path("/")
            .timeout(Duration::from_millis(200));

        let err = execute(&cmd).await.unwrap_err();
        assert!(matches!(err, SandboxError::Timeout(_)));
    }

    #[tokio::test]
    async fn writable_path_allows_write() {
        if !sandbox_available() {
            eprintln!("skipping: sandbox not available");
            return;
        }

        let tmp = std::env::temp_dir().join("aperture-test-sandbox-os");
        let _ = std::fs::create_dir_all(&tmp);

        let cmd =
            SandboxedCommand::new("echo test-content > testfile.txt && cat testfile.txt", &tmp)
                .readable_path("/")
                .writable_path(&tmp)
                .timeout(Duration::from_secs(10));

        let output = execute(&cmd).await.unwrap();
        assert_eq!(output.exit_code, 0);
        assert_eq!(output.stdout.trim(), "test-content");

        // Cleanup.
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn stderr_captured() {
        if !sandbox_available() {
            eprintln!("skipping: sandbox not available");
            return;
        }

        let cmd = SandboxedCommand::new("echo err-msg >&2", std::env::temp_dir())
            .readable_path("/")
            .timeout(Duration::from_secs(10));

        let output = execute(&cmd).await.unwrap();
        assert!(output.stderr.contains("err-msg"));
    }
}
