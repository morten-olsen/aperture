# Filesystem

The filesystem plugin provides sandboxed file access scoped to each user's workspace directory. All paths are relative to the workspace root — the agent cannot access the broader host filesystem.

## Workspace Layout

```
{data_root}/                          # Default: ~/.aperture/data/
└── {user_id}/
    ├── configs/                      # Per-user configuration files
    │   └── cli-rules.toml
    └── workspace/                    # Agent-visible sandbox root
        └── ...                       # Files the agent can read/write
```

The `data_root` is configurable via `RuntimeConfig`. Each user gets an isolated workspace.

## Path Validation

All paths go through `workspace::resolve_sandboxed_path()` before any I/O operation. The validator:

1. **Rejects absolute paths** — Only relative paths are accepted
2. **Rejects `..` components** — No parent directory traversal
3. **Canonicalizes both sides** — The workspace root and target are resolved through `fs::canonicalize()` to defeat symlink escapes
4. **Checks containment** — The canonical target must start with the canonical workspace root
5. **Handles non-existent paths** — For write/mkdir operations, the nearest existing ancestor is canonicalized and the remaining components are appended

```
resolve_sandboxed_path(config, "user-1", "notes/today.md")
  → ~/.aperture/data/user-1/workspace/notes/today.md   ✓

resolve_sandboxed_path(config, "user-1", "/etc/passwd")
  → Error: absolute paths not allowed                   ✗

resolve_sandboxed_path(config, "user-1", "../../etc/passwd")
  → Error: '..' traversal not allowed                   ✗

resolve_sandboxed_path(config, "user-1", "link-to-outside/secret")
  → Error: resolves outside the workspace               ✗
```

## Tools

Seven filesystem tools are registered by `FilesystemPlugin` during `prepare()`:

| Tool | Input | Description |
|------|-------|-------------|
| `fs_read` | `path` | Read a file's contents as a string |
| `fs_write` | `path`, `content` | Write string content to a file (creates parent dirs) |
| `fs_list` | `path?` | List directory entries with name and type (defaults to workspace root) |
| `fs_mkdir` | `path` | Create a directory and any missing parents |
| `fs_remove` | `path` | Remove a file or directory (recursive for dirs) |
| `fs_move` | `from`, `to` | Move or rename a file/directory within the workspace |
| `fs_info` | `path` | Get metadata: size (bytes), modified (unix timestamp), type |

All tools use `tokio::fs` for async I/O. None require human approval — path validation is the security boundary.

### Examples

Read a file:
```json
{ "path": "notes/todo.md" }
→ { "content": "- Buy groceries\n- Fix bug #42" }
```

List a directory:
```json
{ "path": "notes" }
→ { "entries": [
    { "name": "todo.md", "type": "file" },
    { "name": "archive", "type": "directory" }
  ]}
```

File info:
```json
{ "path": "notes/todo.md" }
→ { "size": 38, "modified": 1709568000, "type": "file" }
```

## Plugin Registration

`FilesystemPlugin` requires `RuntimeConfig` in extensions. Register `RuntimeConfigPlugin` first:

```rust
engine.register(Box::new(RuntimeConfigPlugin::new(RuntimeConfig::default()))).await?;
engine.register(Box::new(FilesystemPlugin)).await?;
```

## Configuration

Filesystem behavior is controlled through `RuntimeConfig`:

```rust
pub struct RuntimeConfig {
    pub data_root: PathBuf,           // Default: ~/.aperture/data/
    pub cli_timeout_ms: u64,          // (used by CLI plugin)
    pub cli_max_output_bytes: usize,  // (used by CLI plugin)
}
```

The `data_root` determines where user workspaces live. Override it for server deployments or testing:

```rust
let config = RuntimeConfig {
    data_root: PathBuf::from("/var/aperture/data"),
    ..Default::default()
};
```

## Crate Structure

```
crates/runtime/src/
├── config.rs       RuntimeConfig + RuntimeConfigPlugin
├── workspace.rs    Path resolution and sandbox validation
├── fs_plugin.rs    FilesystemPlugin (registers 7 tools)
└── fs_tools.rs     FsRead, FsWrite, FsList, FsMkdir, FsRemove, FsMove, FsInfo
```

## Integration with Code Sandbox

When the `SandboxPlugin` is registered after `FilesystemPlugin`, the fs tools become callable JavaScript functions inside the QuickJS sandbox:

```javascript
// In run_code:
const data = fs_read({ path: "config.json" });
const config = JSON.parse(data.content);
config.version = "2.0";
fs_write({ path: "config.json", content: JSON.stringify(config, null, 2) });
```

This is the intended usage pattern — the agent writes scripts that orchestrate file operations rather than making individual tool calls.
