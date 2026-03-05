# CLI Execution

The CLI plugin provides sandboxed shell command execution. Commands run inside an OS-native sandbox with filesystem access restricted to the user's workspace and network access denied by default. A configurable allow/deny rule system controls which commands the agent can run.

## Security Model

CLI execution enforces three layers of protection:

1. **Allow/deny rules** — Glob-pattern matching determines which commands are permitted, denied, or require human approval
2. **Human approval** — Unmatched commands pause for human-in-the-loop confirmation; denied commands are always blocked
3. **OS sandbox** — Commands execute inside Seatbelt (macOS) or Landlock+seccomp (Linux) with restricted filesystem and network access

```
Command submitted
    │
    ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│ Check rules │────►│ Deny match?  │──►  │ BLOCKED        │
│             │     │ Yes          │     │ (hard reject)  │
│             │     └──────────────┘     └────────────────┘
│             │
│             │     ┌──────────────┐     ┌────────────────┐
│             │────►│ Allow match? │──►  │ Execute in     │
│             │     │ Yes          │     │ OS sandbox     │
│             │     └──────────────┘     └────────────────┘
│             │
│             │     ┌──────────────┐     ┌────────────────┐
│             │────►│ No match     │──►  │ Pause for      │
│             │     │              │     │ human approval │
└─────────────┘     └──────────────┘     └────────────────┘
```

Deny rules are absolute — even if a human approves a denied command via the approval gate, `invoke()` re-checks and hard-rejects it.

## CLI Rules

Rules are stored per-user in TOML format at `{data_root}/{user_id}/configs/cli-rules.toml`:

```toml
[[deny]]
pattern = "rm -rf **"

[[allow]]
pattern = "cargo build *"
network = true

[[allow]]
pattern = "ls *"
network = false

[[allow]]
pattern = "cat **"
```

### Rule Evaluation

1. **Deny rules checked first** — If any deny pattern matches, the command is blocked
2. **Allow rules checked second** — If an allow pattern matches, the command executes with the rule's `network` setting
3. **No match** — Command is paused for human-in-the-loop approval

### Glob Patterns

Patterns use `glob-match` syntax:

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `ls *` | `ls -la`, `ls foo` | `ls foo/bar` (use `**` for paths) |
| `cargo **` | `cargo build`, `cargo test --release` | `npm test` |
| `rm -rf **` | `rm -rf /tmp/foo`, `rm -rf everything` | `rm file.txt` |
| `python3 *.py` | `python3 script.py` | `python3 dir/script.py` |

Use `*` for single-segment matching and `**` when the command arguments may contain `/` characters (file paths).

### Network Access

Each allow rule has an optional `network` flag (default: `false`). When a command matches an allow rule, the sandbox's network policy is set accordingly:

- `network = true` — Command can make outbound connections (TCP, UDP)
- `network = false` or omitted — Socket creation for `AF_INET`/`AF_INET6` is blocked

## Tools

### `cli_exec`

Execute a shell command in the sandboxed workspace.

**Input:**
```json
{
  "command": "cargo build --release",
  "timeout": 60000
}
```

**Success response:**
```json
{
  "stdout": "   Compiling myproject v0.1.0\n    Finished release [optimized]\n",
  "stderr": "",
  "exit_code": 0
}
```

**Error response (non-zero exit):**

Returns a structured `ToolError` with stdout/stderr/exit_code accessible as properties on the JS Error object:

```javascript
try {
    cli_exec({ command: "cargo build" });
} catch (e) {
    console.log(e.message);   // "command failed with exit code 1"
    console.log(e.stderr);    // "error[E0308]: mismatched types..."
    console.log(e.exit_code); // 1
}
```

**Approval:** Dynamic — auto-approved if command matches an allow rule, blocked if it matches a deny rule, paused for human approval if unmatched.

### `cli_rules_list`

List all current allow/deny rules. **Approval:** Always required.

### `cli_rules_add`

Add a new allow or deny rule. **Approval:** Always required.

**Input:**
```json
{
  "pattern": "npm install *",
  "action": "allow",
  "network": true
}
```

### `cli_rules_remove`

Remove a rule by its exact pattern. **Approval:** Always required.

**Input:**
```json
{ "pattern": "npm install *" }
```

All three rules management tools unconditionally require human approval — the agent cannot silently modify its own permissions.

## OS Sandbox (`crates/sandbox-os/`)

The OS sandbox restricts what a child process can do at the kernel level.

### macOS: Seatbelt

Commands are wrapped with `sandbox-exec -p <profile> /bin/sh -c <command>`. The profile is generated dynamically:

```scheme
(version 1)
(deny default)                              ; deny everything by default
(allow process-exec)                        ; allow running the command
(allow process-fork)
(allow file-read* (subpath "/usr/lib"))     ; system libraries
(allow file-read* (subpath "/bin"))         ; system binaries
;; ... other system paths
(allow file-read* (subpath "<workspace>"))  ; user's workspace (read)
(allow file-write* (subpath "<workspace>")) ; user's workspace (write)
;; (allow network*)                         ; only if allow_network = true
```

### Linux: Landlock + seccomp

Applied via `pre_exec` on the child process:

- **Landlock** (kernel 5.13+) — Filesystem access rules restrict reads/writes to specified paths
- **seccomp-bpf** — Blocks `socket()` calls for `AF_INET`/`AF_INET6` when network is denied (Unix domain sockets are unaffected)
- **Kernel < 5.13** — Returns `SandboxError::Unavailable`; refuses to run unsandboxed

### Execution Limits

| Limit | Default | Configurable |
|-------|---------|-------------|
| Timeout | 30s | `timeout` field in `cli_exec` input, or `RuntimeConfig::cli_timeout_ms` |
| Max output | 10 MB | `RuntimeConfig::cli_max_output_bytes` |
| Network | Denied | Per allow-rule `network` flag |
| stdin | Null | Not configurable |

On timeout, the process is killed with SIGKILL. On output limit exceeded, the process is killed and `SandboxError::OutputLimitExceeded` is returned.

## Plugin Registration

`CliPlugin` requires `RuntimeConfig` in extensions. Register `RuntimeConfigPlugin` first:

```rust
engine.register(Box::new(RuntimeConfigPlugin::new(RuntimeConfig::default()))).await?;
engine.register(Box::new(CliPlugin)).await?;
```

## Crate Structure

```
crates/sandbox-os/src/
├── lib.rs              Public API: execute(), sandbox_available()
├── error.rs            SandboxError enum
├── command.rs          SandboxedCommand builder
├── output.rs           CommandOutput struct
├── execute.rs          Process spawning, timeout, output limiting
└── platform/
    ├── mod.rs          cfg-based dispatch
    ├── macos.rs        Seatbelt profile generation
    └── linux.rs        Landlock + seccomp setup

crates/runtime/src/
├── cli_plugin.rs       CliPlugin (registers cli_exec + rules tools)
├── cli_exec.rs         CliExec ToolInvoke — delegates to sandbox-os
├── cli_rules.rs        TOML serde, check_command(), glob matching
└── cli_rules_tools.rs  CliRulesList, CliRulesAdd, CliRulesRemove
```

## Structured Tool Errors

CLI failures use `EngineError::ToolError`, a variant that carries a message plus structured data:

```rust
EngineError::ToolError {
    message: "command failed with exit code 1".into(),
    data: json!({
        "stdout": "...",
        "stderr": "...",
        "exit_code": 1,
        "command": "cargo build",
    }),
}
```

In the code sandbox, this becomes a JS `Error` with each data key set as a property, so `catch (e) { e.stderr }` works naturally. Plain `ToolInvocation` errors continue to produce standard Error objects — the two paths are fully backward compatible.

## Integration with Code Sandbox

When used with the `SandboxPlugin`, `cli_exec` becomes a JavaScript function:

```javascript
// Run a build and check the output
try {
    const result = cli_exec({ command: "cargo test" });
    console.log("Tests passed:", result.stdout);
} catch (e) {
    console.log("Tests failed:", e.stderr);
    console.log("Exit code:", e.exit_code);
}
```

This is the intended pattern — the agent writes scripts that run commands, parse output, and handle errors in code rather than across multiple inference steps.
