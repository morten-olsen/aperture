# Architecture Overview

Aperture is a plugin-driven AI agent framework in Rust. The engine handles the agent loop, LLM interaction, and plugin orchestration; all domain-specific functionality is delivered through plugins. Plugins can be native Rust or WASM components loaded via Wasmtime.

## Design Principles

### Minimal Primitives, Maximum Capability

The goal is to provide the fewest possible primitives for the agent to understand while enabling highly capable behavior. LLMs already know how to use CLI tools, generate code, and reason through problems — the framework should not reimplement what the model already knows. Instead, it provides a modular platform for plugging in constructs *outside* the model's training data: self-scheduling, file system interaction, external service integration, and other environmental capabilities.

Custom tool sets require specific instructions that consume context and add cognitive load. Prefer leveraging the agent's existing knowledge (e.g., letting it generate and execute code) over building bespoke tools for every capability.

### Secure by Default

All agent actions are sandboxed and deny-by-default:

- **No implicit CLI access** — An agent cannot execute shell commands unless explicitly allowed by configuration
- **Scoped file system** — CLI commands and file operations are restricted to the agent's owned workspace; no access to the broader system
- **Capability gating** — Every privileged action (network, database, external APIs) must be explicitly granted through the plugin/extension system
- **WASM isolation** — Third-party plugins run in sandboxed WASM, with only explicitly granted host capabilities

### Code Over Tools

Tool calling is not part of LLM training data — it is synthesised after training. But LLMs are deeply trained on understanding, writing, and reasoning about code. The framework leans into this: instead of chaining tool calls (fetch result into context → parse → construct next tool input → call next tool), the agent writes a script that does the whole job.

This avoids several problems with tool-heavy patterns:

- **Context bloat** — Tool results get dumped into context even when only a fraction is needed. Code can filter, transform, and discard internally.
- **Lossy inference** — Data mutations, conditional logic, and error handling that are trivial in code become fragile when an LLM must reason through them across multiple inference steps.
- **Context as data store** — Multi-tool chains force the context window to serve as working memory between calls. Code keeps intermediate state in variables where it belongs.

The agent's context should be reserved for what matters: understanding the user's intent, planning the approach, and reviewing results — not shuttling data between tool invocations.

### Composable Extensibility

The AI assistant landscape evolves rapidly — a memory strategy that works today may be obsolete tomorrow, and different users have fundamentally different needs. The framework must be composable from individual, interchangeable components so users can assemble the right harness for their use case.

Critically, the ecosystem should not be confined to this repository. Third-party developers with diverse use cases should be able to author, publish, and share plugins independently. The plugin contract (WIT interfaces, trait definitions) is the public API — the engine is just the orchestrator.

### Additional Principles

- **Plugin-first** — Everything beyond the basic agent loop is a plugin
- **WASM-native extensions** — Plugins are WASM components (via Wasmtime + Component Model), enabling polyglot authoring and sandboxed execution
- **Native plugins for host capabilities** — Rust-native plugins provide host-level features (filesystem, database, network) that WASM can't directly access
- **Type-safe** — Rust's type system + serde for serialization boundaries
- **Composable** — Plugins independently contribute tools, context, and state

## Crate Structure

```
crates/
├── engine/      Plugin trait, tools, services, events, prompt model, agent loop, LLM interaction
├── sandbox-code/ QuickJS code sandbox — replaces tool calling with script execution
├── sandbox-os/  OS-native process sandboxing (Seatbelt on macOS, Landlock+seccomp on Linux)
├── runtime/     Runtime plugins — filesystem, CLI execution, configuration
└── wasm-host/   Wasmtime integration, WASM plugin loading and bridging (future)
```

### Dependency Graph

```
               ┌──────────┐
               │  engine  │
               └────┬─────┘
                    │
     ┌──────────┬───┴──────┬──────────────┐
     │          │          │              │
┌────┴─────┐ ┌──┴───────┐ ┌┴───────────┐  │
│ runtime  │ │ sandbox- │ │ sandbox-os │  │
│          │ │   code   │ │            │  │
└────┬─────┘ └──────────┘ └────────────┘  │
     │                      ▲             │
     └──────────────────────┘      ┌──────┴─────┐
          (depends on)             │ wasm-host  │
                                   └────────────┘
```

### What Goes Where

**Engine** — The machinery. Defines contracts and runs the loop:

- `Plugin` trait (lifecycle: `setup`, `prepare`)
- `Tool` — model-facing functions the LLM can call
- `Extensions` — type map for inter-plugin service sharing
- `PromptOutput`, `Prompt`, `PromptState` data types
- `ContextItem` struct
- `EventBus` — typed pub/sub
- `State` — ephemeral per-prompt plugin state
- `Engine` struct — owns plugin registry, extensions, and event bus; drives the agent loop
- `ToolDescriptor`, `ToolCallRequest`, `SandboxResult` — shared types for sandbox integration
- LLM client and message projection
- Error types

**Sandbox** — The code execution layer. Implements Code Over Tools:

- `CodeSandbox` trait — abstracts the JS execution engine
- `QuickJsSandbox` — QuickJS-based implementation
- `SandboxPlugin` — drains prior tools, exposes `run_code` + `inspect_tool`
- Function listing generator and tool inspection
- Structured error support — `ToolError` data properties become JS Error properties

See [Code Sandbox](./code-sandbox.md).

**Sandbox-OS** — OS-native process sandboxing for CLI commands:

- `SandboxedCommand` builder — command, timeout, output limits, path restrictions, network control
- macOS: Seatbelt profile generation + `sandbox-exec` wrapping
- Linux: Landlock filesystem restrictions + seccomp network blocking
- Async execution with `tokio::process`, timeout enforcement, output size limiting

**Runtime** — Runtime plugins and host environment interaction:

- `RuntimeConfig` — configurable data root, timeouts, output limits
- Filesystem plugin — 7 sandboxed file tools scoped to per-user workspaces
- CLI plugin — shell execution with allow/deny rules, OS sandboxing, structured errors
- CLI rules — TOML-based glob patterns, deny-first evaluation, per-rule network control

See [Filesystem](./filesystem.md) and [CLI](./cli.md).

## Core Concepts

### Engine

The `Engine` struct is the central owner of shared infrastructure — plugin registry, extensions (type map), event bus, and the agent loop. Plugins receive what they need through their lifecycle method parameters (`SetupContext`, `PrepareContext`).

```rust
let mut engine = Engine::new(llm_client);
engine.register(Box::new(MyPlugin::new())).await?;

let prompt = engine.run(PromptInput {
    user_id: "alice".into(),
    input: Some("What can you do?".into()),
    state: State::new(),
    history: vec![],
}).await?;
```

### Tools vs Services

The framework distinguishes between two kinds of capabilities:

**Tools** — Model-facing. Functions the LLM sees and can call during conversation. Exposed in the function-calling interface. Contributed by plugins during `prepare()`.

**Services** — Internal. APIs one plugin exposes for other plugins to consume programmatically. Not visible to the model. Shared via the `Extensions` type map (native) or `host.call-service()` WIT import (WASM).

| | Tools | Services |
|---|---|---|
| **Called by** | The LLM model | Other plugins |
| **Visible to model** | Yes | No |
| **Native plugins** | Contributed via `prepare()` | Shared via `Extensions` type map |
| **WASM plugins** | Returned from guest `prepare()` | Called via `host.call-service()` WIT import |

See [Tools](./tools.md) and [Services](./services.md).

### Plugins

Plugins extend the framework through two lifecycle hooks:

- **`setup()`** — Called once at registration time for initialization and service registration
- **`prepare()`** — Called before each prompt to contribute tools, context items, and state

Native plugins implement the `Plugin` trait directly. WASM plugins export functions defined in WIT interfaces and are wrapped by a host adapter.

See [Plugin System](./plugin-system.md).

### State

Per-plugin, per-prompt ephemeral storage. Keyed by plugin ID, stored as `serde_json::Value`. Lives for one prompt execution. The runtime layer is responsible for carrying state across prompts in a conversation.

See [State](./state.md).

### Events

Typed pub/sub event system built on tokio broadcast channels. Plugins can define, publish, and subscribe to events.

See [Events](./events.md).

## Agent Loop

The engine's agent loop follows a prepare → call → process cycle:

```
┌─────────────────────────────────────────────┐
│ 1. PREPARE                                  │
│    For each registered plugin:              │
│    - Call plugin.prepare() with context,    │
│      tools, state, and event bus            │
│    - Plugins push tools, context items,     │
│      and update state                       │
├─────────────────────────────────────────────┤
│ 2. CALL MODEL                               │
│    - Build messages from context + history  │
│    - Convert tools to function definitions  │
│    - Send to LLM provider                   │
├─────────────────────────────────────────────┤
│ 3. PROCESS RESPONSE                         │
│    If tool calls:                           │
│      - Validate input                       │
│      - Check approval gates                 │
│      - Invoke tool                          │
│      - Record result, loop back to step 1   │
│    If text:                                 │
│      - Record output, mark completed        │
│      - Exit loop                            │
├─────────────────────────────────────────────┤
│ 4. EVENTS                                   │
│    - Emit events after each iteration       │
│    - Emit 'completed' when done             │
└─────────────────────────────────────────────┘
```

See [Agent Loop](./agent-loop.md).

### Code Sandbox

The code sandbox implements the Code Over Tools principle. A `SandboxPlugin` drains all tools from prior plugins and exposes them as callable JavaScript functions inside a QuickJS sandbox. The LLM writes scripts instead of chaining tool calls.

See [Code Sandbox](./code-sandbox.md).

### Filesystem and CLI

The runtime crate provides two key plugins for agent interaction with the host environment:

- **Filesystem** — Sandboxed file access scoped to per-user workspace directories. Path validation prevents escapes via absolute paths, `..` traversal, or symlinks.
- **CLI** — Sandboxed shell command execution with configurable allow/deny rules and OS-native process isolation (Seatbelt/Landlock+seccomp). Non-zero exit codes produce structured errors with stdout/stderr accessible in JS catch blocks.

See [Filesystem](./filesystem.md) and [CLI](./cli.md).

## Two-Tier Plugin Model

```
┌─────────────────────────────────────────────────────┐
│ Engine                                              │
│                                                     │
│  Extensions (type map)                              │
│  ├── HomeAssistantService                           │
│  ├── DatabaseService                                │
│  └── ...                                            │
│                                                     │
│  Native Plugins ──── full access ────► Extensions   │
│                                        EventBus     │
│                                        State        │
│                                                     │
│  WASM Plugins ────── WIT only ──────► tools,        │
│                                        events,      │
│                                        state,       │
│                                        context,     │
│                                        call-service │
└─────────────────────────────────────────────────────┘
```

### Native Plugins

Implement the `Plugin` trait directly in Rust. Full access to the host environment, extensions type map, and other native services. Used for capabilities that require host-level access or tight integration with other plugins.

### WASM Plugins

Compiled to WASM components, loaded and executed via Wasmtime. Defined through WIT interfaces. Sandboxed — they can only access capabilities explicitly granted by the host. Can consume services via the `host.call-service()` WIT import, which bridges to the host's extensions type map.

See [Plugin System](./plugin-system.md).

## Key Differences from TypeScript Reference

| Aspect | TypeScript | Rust |
|--------|-----------|------|
| Plugin boundary | In-process JS objects | WASM Component Model + WIT |
| Type validation | Zod schemas (runtime) | Rust type system (compile-time) + serde (boundaries) |
| Dependency wiring | DI container (runtime type resolution) | Extensions type map (native) + WIT imports (WASM) |
| Async runtime | Node.js event loop | Tokio |
| Plugin isolation | None (shared process) | WASM sandboxing via Wasmtime |
| Execution modes | Classic + Code | Classic only |
| Crate split | Single `core` package | `engine` (ephemeral) + `runtime` (persistent) |
| Tools vs services | Tools serve both roles | Distinct: tools (model-facing) vs services (internal) |
