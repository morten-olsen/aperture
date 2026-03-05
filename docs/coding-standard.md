# Coding Standard

Rules and conventions for the Aperture codebase. When in doubt, match existing code nearby.

## Module Organization

**Flat** for small crates — one file per concern. When a group of related files reaches 3+, move them into a subdirectory with a `mod.rs`.

Extract a file when it passes ~500 lines. Hard ceiling: ~800 lines. If a file is approaching the limit, look for a logical seam (e.g., a trait + impls, a helper block) and pull it out.

## Public API

Expose internal modules through re-exports, never through `pub mod`:

```rust
// lib.rs — GOOD
mod engine;
pub use engine::Engine;

// lib.rs — BAD
pub mod engine; // leaks internal module path
```

Consumers should import from the crate root (`aperture_engine::Engine`), not from internal module paths. The `pub use` re-exports in `lib.rs` define the public surface.

## Function Signatures

Positional arguments are fine up to ~5-6 parameters. When the count grows or many parameters are optional, switch to a builder or config struct:

```rust
// Fine — small, all required.
fn connect(host: &str, port: u16, tls: bool) -> Result<Connection>

// Better as a struct — many optional fields.
struct ConnectOptions { host: String, port: u16, tls: bool, timeout: Option<Duration>, ... }
fn connect(opts: ConnectOptions) -> Result<Connection>
```

## Error Handling

Use `thiserror` with domain-specific variants. Every crate defines its own `EngineError` / error enum and a `Result<T>` alias.

```rust
#[derive(Debug, thiserror::Error)]
pub enum MyError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("plugin setup failed: {0}")]
    PluginSetup(String),
}

pub type Result<T> = std::result::Result<T, MyError>;
```

No `unwrap()` or `expect()` in library code. Tests may use them freely.

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Plugin ID | lowercase, hyphen-separated | `"home-assistant"` |
| Tool ID | `{domain}_{action}` | `fs_read`, `cli_exec` |
| Event ID | `{plugin}.{action}` | `prompt.created` |
| Modules | snake_case | `cli_exec.rs` |
| Types | PascalCase | `FilesystemPlugin` |

## Testing

- Inline `#[cfg(test)] mod tests` at the bottom of each file.
- Helper types (mock LLM, test plugins) live inside the test module.
- Use `#[tokio::test]` for async tests.
- One assertion concept per test — but multiple `assert!` calls are fine to verify one logical outcome.

## Code Smells to Avoid

**`let _ =` to suppress unused bindings** — Use `..` in the pattern instead:

```rust
// BAD
if let PromptOutput::Tool { tool_id, input, result } = &mut x {
    let _ = (tool_id, input);
}

// GOOD
if let PromptOutput::Tool { result, .. } = &mut x {
}
```

**`pub mod` for internal modules** — Use `mod` + `pub use` (see Public API above).

**Duplicated logic** — If two blocks are structurally identical, extract a shared function. Don't let copy-paste drift create subtle bugs.

**Giant files** — See Module Organization above. If you're scrolling a lot, it's time to split.
