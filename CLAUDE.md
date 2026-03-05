# Aperture

Rust agent framework. Workspace with `crates/*` members.

## Commands

```sh
cargo build              # build all crates
cargo test               # run all tests
cargo test -p <crate>    # run tests for one crate (e.g. aperture-engine)
cargo clippy             # lint
cargo fmt -- --check     # format check
```

## Crate Map

| Crate | Package | Purpose |
|-------|---------|---------|
| `crates/engine/` | `aperture-engine` | Plugin trait, tools, services, events, prompt model, agent loop |
| `crates/sandbox-code/` | `aperture-sandbox-code` | QuickJS code sandbox |
| `crates/sandbox-os/` | `aperture-sandbox-os` | OS-native process sandboxing (Seatbelt/Landlock+seccomp) |
| `crates/runtime/` | `aperture-runtime` | Runtime plugins — filesystem, CLI, scripting, conversation |
| `crates/server/` | `aperture-server` | WebSocket server wired to OpenAI-compatible API |
| `crates/playground/` | `aperture-playground` | Interactive REPL |

## Key Rules

- **No `pub mod`** — use `mod` + `pub use` in lib.rs
- **No `unwrap`/`expect`** in library code
- **Extract at ~500 lines**, hard ceiling ~800
- **`..` in patterns**, not `let _ =` to suppress bindings
- Tool IDs: `{domain}_{action}`, event IDs: `{plugin}.{action}`
- `thiserror` for errors, `#[tokio::test]` for async tests

Full standard: [docs/coding-standard.md](docs/coding-standard.md)

## Essential Docs

- [docs/architecture.md](docs/architecture.md) — system overview, core concepts, data flow
- [docs/plugin-system.md](docs/plugin-system.md) — Plugin trait, lifecycle, registration
- [docs/tools.md](docs/tools.md) — Tool definition, ToolInvoke, approval gates
- [docs/agent-loop.md](docs/agent-loop.md) — run/approve/reject flow, message projection
- [docs/code-sandbox.md](docs/code-sandbox.md) — QuickJS sandbox, script execution model
- [docs/coding-standard.md](docs/coding-standard.md) — module organization, naming, error handling
