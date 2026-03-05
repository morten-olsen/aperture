use tokio::io::AsyncReadExt;
use tokio::process::Command;

use crate::command::SandboxedCommand;
use crate::error::{Result, SandboxError};
use crate::output::CommandOutput;
use crate::platform;

/// Execute a command inside an OS-native sandbox.
pub async fn execute(cmd: &SandboxedCommand) -> Result<CommandOutput> {
    let wrapped = platform::wrap(cmd)?;

    let mut process_cmd = Command::new(&wrapped.program);
    process_cmd
        .args(&wrapped.args)
        .current_dir(&cmd.working_dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // On Linux, apply Landlock/seccomp in the child process.
    #[cfg(target_os = "linux")]
    {
        let readable = cmd.readable_paths.clone();
        let writable = cmd.writable_paths.clone();
        let allow_net = cmd.allow_network;

        // Build a SandboxedCommand-like struct for pre_exec (avoid borrowing across spawn).
        unsafe {
            process_cmd.pre_exec(move || {
                let setup_cmd = SandboxedCommand {
                    command: String::new(),
                    working_dir: std::path::PathBuf::new(),
                    timeout: std::time::Duration::ZERO,
                    max_output_bytes: 0,
                    allow_network: allow_net,
                    writable_paths: writable.clone(),
                    readable_paths: readable.clone(),
                };
                platform::pre_exec_setup(&setup_cmd)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                Ok(())
            });
        }
    }

    let mut child = process_cmd
        .spawn()
        .map_err(|e| SandboxError::SpawnFailed(e.to_string()))?;

    let mut stdout_handle = child.stdout.take().unwrap();
    let mut stderr_handle = child.stderr.take().unwrap();

    let max_bytes = cmd.max_output_bytes;
    let timeout_dur = cmd.timeout;

    // Read stdout and stderr concurrently, with size limits.
    let result = tokio::time::timeout(timeout_dur, async {
        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();
        let mut stdout_overflow = false;
        let mut stderr_overflow = false;

        // Read in chunks to enforce size limits.
        let stdout_task = async {
            let mut chunk = [0u8; 8192];
            loop {
                match stdout_handle.read(&mut chunk).await {
                    Ok(0) => break,
                    Ok(n) => {
                        if stdout_buf.len() + n > max_bytes {
                            stdout_overflow = true;
                            break;
                        }
                        stdout_buf.extend_from_slice(&chunk[..n]);
                    }
                    Err(e) => return Err(SandboxError::Io(e)),
                }
            }
            Ok((stdout_buf, stdout_overflow))
        };

        let stderr_task = async {
            let mut chunk = [0u8; 8192];
            loop {
                match stderr_handle.read(&mut chunk).await {
                    Ok(0) => break,
                    Ok(n) => {
                        if stderr_buf.len() + n > max_bytes {
                            stderr_overflow = true;
                            break;
                        }
                        stderr_buf.extend_from_slice(&chunk[..n]);
                    }
                    Err(e) => return Err(SandboxError::Io(e)),
                }
            }
            Ok((stderr_buf, stderr_overflow))
        };

        let (stdout_result, stderr_result) = tokio::join!(stdout_task, stderr_task);
        let (stdout_bytes, so) = stdout_result?;
        let (stderr_bytes, se) = stderr_result?;

        if so || se {
            // Kill the process if output limit exceeded.
            let _ = child.kill().await;
            return Err(SandboxError::OutputLimitExceeded { limit: max_bytes });
        }

        let status = child.wait().await.map_err(SandboxError::Io)?;
        let exit_code = status.code().unwrap_or(-1);

        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
            stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
            exit_code,
        })
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => {
            // Timeout — kill the process.
            let _ = child.kill().await;
            Err(SandboxError::Timeout(timeout_dur))
        }
    }
}
