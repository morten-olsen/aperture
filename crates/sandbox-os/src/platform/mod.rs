#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;

use crate::command::SandboxedCommand;
use crate::error::Result;

/// The command and args to actually execute after sandboxing is applied.
pub struct WrappedCommand {
    pub program: String,
    pub args: Vec<String>,
}

/// Wrap a command with platform-specific sandbox restrictions.
///
/// On macOS, this uses `sandbox-exec` with a generated Seatbelt profile.
/// On Linux, this returns the command directly (Landlock/seccomp applied via pre_exec).
pub fn wrap(cmd: &SandboxedCommand) -> Result<WrappedCommand> {
    #[cfg(target_os = "macos")]
    {
        macos::wrap(cmd)
    }
    #[cfg(target_os = "linux")]
    {
        linux::wrap(cmd)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = cmd;
        Err(crate::error::SandboxError::Unavailable)
    }
}

/// Apply pre-execution sandbox setup (called in the child process).
///
/// On Linux, this applies Landlock and seccomp rules.
/// On macOS, sandboxing is handled by the `sandbox-exec` wrapper, so this is a no-op.
#[cfg(target_os = "linux")]
pub unsafe fn pre_exec_setup(cmd: &SandboxedCommand) -> Result<()> {
    linux::pre_exec_setup(cmd)
}
