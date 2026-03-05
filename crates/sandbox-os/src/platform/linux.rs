use crate::command::SandboxedCommand;
use crate::error::{Result, SandboxError};
use super::WrappedCommand;

/// On Linux, the command runs directly — sandboxing is applied via pre_exec.
pub fn wrap(cmd: &SandboxedCommand) -> Result<WrappedCommand> {
    // Check Landlock availability (requires kernel 5.13+).
    let abi = landlock::ABI::new_current()
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock ABI check: {e}")))?;
    if abi < landlock::ABI::V1 {
        return Err(SandboxError::Unavailable);
    }

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
    use landlock::{
        Access, AccessFs, PathBeneath, PathFd, Ruleset, RulesetAttr, RulesetCreatedAttr,
        RulesetStatus, ABI,
    };

    let abi = ABI::new_current()
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock ABI: {e}")))?;

    let read_access = AccessFs::ReadFile | AccessFs::ReadDir | AccessFs::Execute;
    let write_access = read_access | AccessFs::WriteFile | AccessFs::RemoveFile
        | AccessFs::RemoveDir | AccessFs::MakeReg | AccessFs::MakeDir
        | AccessFs::MakeSym;

    let mut ruleset = Ruleset::default()
        .handle_access(AccessFs::from_all(abi))
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock ruleset: {e}")))?
        .create()
        .map_err(|e| SandboxError::SetupFailed(format!("Landlock create: {e}")))?;

    // System paths: read-only.
    for path in &["/usr", "/bin", "/lib", "/lib64", "/etc", "/dev", "/proc", "/sys"] {
        if let Ok(fd) = PathFd::new(path) {
            let _ = ruleset.add_rule(PathBeneath::new(fd, read_access));
        }
    }

    // Temp paths: read+write.
    for path in &["/tmp", "/var/tmp"] {
        if let Ok(fd) = PathFd::new(path) {
            let _ = ruleset.add_rule(PathBeneath::new(fd, write_access));
        }
    }

    // User-specified readable paths.
    for path in &cmd.readable_paths {
        if let Ok(fd) = PathFd::new(path) {
            let _ = ruleset.add_rule(PathBeneath::new(fd, read_access));
        }
    }

    // User-specified writable paths.
    for path in &cmd.writable_paths {
        if let Ok(fd) = PathFd::new(path) {
            let _ = ruleset.add_rule(PathBeneath::new(fd, write_access));
        }
    }

    let status = ruleset
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
            SeccompRule::new(vec![
                seccompiler::SeccompCondition::new(
                    0,
                    seccompiler::SeccompCmpArgLen::Dword,
                    seccompiler::SeccompCmpOp::Eq,
                    af_inet,
                )
                .map_err(|e| SandboxError::SetupFailed(format!("seccomp condition: {e}")))?,
            ])
            .map_err(|e| SandboxError::SetupFailed(format!("seccomp rule: {e}")))?,
            SeccompRule::new(vec![
                seccompiler::SeccompCondition::new(
                    0,
                    seccompiler::SeccompCmpArgLen::Dword,
                    seccompiler::SeccompCmpOp::Eq,
                    af_inet6,
                )
                .map_err(|e| SandboxError::SetupFailed(format!("seccomp condition: {e}")))?,
            ])
            .map_err(|e| SandboxError::SetupFailed(format!("seccomp rule: {e}")))?,
        ],
    );

    let filter = SeccompFilter::new(
        rules,
        SeccompAction::Allow,   // default: allow everything
        SeccompAction::Errno(libc::EACCES as u32), // matched rules: deny with EACCES
        std::env::consts::ARCH.try_into()
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
