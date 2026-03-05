use landlock::{
    path_beneath_rules, Access, AccessFs, Ruleset, RulesetAttr, RulesetCreatedAttr, RulesetStatus,
    ABI,
};

use super::WrappedCommand;
use crate::command::SandboxedCommand;
use crate::error::{Result, SandboxError};

const ABI_VERSION: ABI = ABI::V4;

/// On Linux, the command runs directly — sandboxing is applied via pre_exec.
pub fn wrap(cmd: &SandboxedCommand) -> Result<WrappedCommand> {
    // Probe Landlock support by attempting to create a minimal ruleset.
    // Ruleset::default() probes kernel support; create() will fail if
    // Landlock is not available (requires kernel 5.13+).
    Ruleset::default()
        .handle_access(AccessFs::from_all(ABI_VERSION))
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock handle_access: {e}")))?
        .create()
        .map_err(|_| SandboxError::Unavailable)?;

    Ok(WrappedCommand {
        program: "/bin/sh".to_string(),
        args: vec!["-c".to_string(), cmd.command.clone()],
    })
}

/// Apply Landlock filesystem restrictions and seccomp network restrictions.
///
/// # Safety
/// Must be called from a `pre_exec` closure (single-threaded child process).
pub unsafe fn pre_exec_setup(cmd: &SandboxedCommand) -> Result<()> {
    apply_landlock(cmd)?;
    if !cmd.allow_network {
        apply_seccomp_network_deny()?;
    }
    Ok(())
}

fn apply_landlock(cmd: &SandboxedCommand) -> Result<()> {
    let access_all = AccessFs::from_all(ABI_VERSION);
    let access_read = AccessFs::from_read(ABI_VERSION);

    let system_paths = [
        "/usr", "/bin", "/lib", "/lib64", "/etc", "/dev", "/proc", "/sys",
    ];
    let temp_paths = ["/tmp", "/var/tmp"];

    let status = Ruleset::default()
        .handle_access(access_all)
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock ruleset: {e}")))?
        .create()
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock create: {e}")))?
        // System paths: read-only.
        .add_rules(path_beneath_rules(system_paths, access_read))
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock system rules: {e}")))?
        // Temp paths: read+write.
        .add_rules(path_beneath_rules(temp_paths, access_all))
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock temp rules: {e}")))?
        // User-specified readable paths.
        .add_rules(path_beneath_rules(&cmd.readable_paths, access_read))
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock read rules: {e}")))?
        // User-specified writable paths.
        .add_rules(path_beneath_rules(&cmd.writable_paths, access_all))
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock write rules: {e}")))?
        .restrict_self()
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock restrict: {e}")))?;

    if status.ruleset == RulesetStatus::NotEnforced {
        return Err(SandboxError::Unavailable);
    }

    Ok(())
}

fn apply_seccomp_network_deny() -> Result<()> {
    use seccompiler::{BpfProgram, SeccompAction, SeccompFilter, SeccompRule};
    use std::collections::BTreeMap;

    // Block socket() calls for AF_INET (2) and AF_INET6 (10).
    // socket() is syscall number 41 on x86_64, 198 on aarch64.
    #[cfg(target_arch = "x86_64")]
    let socket_nr: i64 = libc::SYS_socket;
    #[cfg(target_arch = "aarch64")]
    let socket_nr: i64 = libc::SYS_socket;

    let af_inet = libc::AF_INET as u64;
    let af_inet6 = libc::AF_INET6 as u64;

    let mut rules: BTreeMap<i64, Vec<SeccompRule>> = BTreeMap::new();

    // Block socket(AF_INET, ...) and socket(AF_INET6, ...).
    rules.insert(
        socket_nr,
        vec![
            SeccompRule::new(vec![seccompiler::SeccompCondition::new(
                0,
                seccompiler::SeccompCmpArgLen::Dword,
                seccompiler::SeccompCmpOp::Eq,
                af_inet,
            )
            .map_err(|e| SandboxError::SetupFailed(format!("seccomp condition: {e}")))?])
            .map_err(|e| SandboxError::SetupFailed(format!("seccomp rule: {e}")))?,
            SeccompRule::new(vec![seccompiler::SeccompCondition::new(
                0,
                seccompiler::SeccompCmpArgLen::Dword,
                seccompiler::SeccompCmpOp::Eq,
                af_inet6,
            )
            .map_err(|e| SandboxError::SetupFailed(format!("seccomp condition: {e}")))?])
            .map_err(|e| SandboxError::SetupFailed(format!("seccomp rule: {e}")))?,
        ],
    );

    let filter = SeccompFilter::new(
        rules,
        SeccompAction::Allow,                      // default: allow everything
        SeccompAction::Errno(libc::EACCES as u32), // matched rules: deny with EACCES
        std::env::consts::ARCH
            .try_into()
            .map_err(|_| SandboxError::SetupFailed("unsupported architecture".into()))?,
    )
    .map_err(|e| SandboxError::SetupFailed(format!("seccomp filter: {e}")))?;

    let prog: BpfProgram = filter
        .try_into()
        .map_err(|e| SandboxError::SetupFailed(format!("seccomp compile: {e}")))?;

    seccompiler::apply_filter(&prog)
        .map_err(|e| SandboxError::SetupFailed(format!("seccomp apply: {e}")))?;

    Ok(())
}
