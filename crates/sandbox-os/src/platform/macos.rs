use std::path::Path;

use super::WrappedCommand;
use crate::command::SandboxedCommand;
use crate::error::Result;

/// Generate a Seatbelt (sandbox-exec) profile for the given command.
fn generate_profile(cmd: &SandboxedCommand) -> String {
    let mut profile = String::new();
    profile.push_str("(version 1)\n");
    profile.push_str("(deny default)\n");
    profile.push_str("(allow process-exec)\n");
    profile.push_str("(allow process-fork)\n");
    profile.push_str("(allow signal (target self))\n");
    profile.push_str("(allow sysctl-read)\n");

    // System paths needed for basic command execution.
    for path in &[
        "/usr/lib",
        "/usr/share",
        "/System",
        "/bin",
        "/usr/bin",
        "/dev/null",
        "/dev/urandom",
        "/dev/random",
        "/private/var/db/dyld",
        "/Library/Preferences/Logging",
    ] {
        profile.push_str(&format!("(allow file-read* (subpath \"{path}\"))\n"));
    }

    // /dev/null and /dev/urandom need write access for some commands.
    profile.push_str("(allow file-write* (literal \"/dev/null\"))\n");

    // Allow reading /etc for DNS resolution, shell config, etc.
    profile.push_str("(allow file-read* (subpath \"/etc\"))\n");
    profile.push_str("(allow file-read* (subpath \"/private/etc\"))\n");

    // $TMPDIR — writable automatically.
    if let Ok(tmpdir) = std::env::var("TMPDIR") {
        if let Some(canonical) = canonicalize_opt(&tmpdir) {
            profile.push_str(&format!("(allow file-read* (subpath \"{canonical}\"))\n"));
            profile.push_str(&format!("(allow file-write* (subpath \"{canonical}\"))\n"));
        }
    }
    // Common tmp paths.
    for tmp in &["/tmp", "/private/tmp", "/var/folders"] {
        profile.push_str(&format!("(allow file-read* (subpath \"{tmp}\"))\n"));
        profile.push_str(&format!("(allow file-write* (subpath \"{tmp}\"))\n"));
    }

    // User-specified readable paths.
    for path in &cmd.readable_paths {
        if let Some(canonical) = canonicalize_opt(path) {
            profile.push_str(&format!("(allow file-read* (subpath \"{canonical}\"))\n"));
        }
    }

    // User-specified writable paths (write implies read).
    for path in &cmd.writable_paths {
        if let Some(canonical) = canonicalize_opt(path) {
            profile.push_str(&format!("(allow file-read* (subpath \"{canonical}\"))\n"));
            profile.push_str(&format!("(allow file-write* (subpath \"{canonical}\"))\n"));
        }
    }

    // Network access.
    if cmd.allow_network {
        profile.push_str("(allow network*)\n");
    }

    profile
}

fn canonicalize_opt(path: impl AsRef<Path>) -> Option<String> {
    std::fs::canonicalize(path.as_ref())
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

/// Wrap the command using `sandbox-exec -p <profile> /bin/sh -c <command>`.
pub fn wrap(cmd: &SandboxedCommand) -> Result<WrappedCommand> {
    let profile = generate_profile(cmd);

    Ok(WrappedCommand {
        program: "/usr/bin/sandbox-exec".to_string(),
        args: vec![
            "-p".to_string(),
            profile,
            "/bin/sh".to_string(),
            "-c".to_string(),
            cmd.command.clone(),
        ],
    })
}
