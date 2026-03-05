# Code Sandbox

The code sandbox implements the [Code Over Tools](./architecture.md#code-over-tools) design principle. Instead of the LLM chaining tool calls across inference steps, it writes a JavaScript script that does the whole job — filtering, transforming, error handling, and multi-step orchestration all in code. The LLM sees only two tools: `run_code` and `inspect_tool`.

## How It Works

The `SandboxPlugin` is registered **last**, after all other plugins. During `prepare()`, it drains every tool registered by prior plugins and wraps them as callable functions inside a QuickJS JavaScript sandbox. The LLM writes scripts that call these functions directly.

```
Before SandboxPlugin              After SandboxPlugin
┌──────────────────┐              ┌──────────────────┐
│ Tools:           │              │ Tools:           │
│  - echo          │     →        │  - run_code      │
│  - get_time      │              │  - inspect_tool  │
│  - read_file     │              │                  │
│  - write_file    │              │ Context:         │
│  - query_db      │              │  "Functions:     │
└──────────────────┘              │   echo, get_time,│
                                  │   read_file, …"  │
                                  └──────────────────┘
```

### The Two Tools

**`run_code`** — Executes JavaScript in a QuickJS sandbox. All drained tools are available as global functions. Returns the script's return value and any `console.log` output.

```json
{
  "code": "const data = read_file({path: 'config.json'});\nconst parsed = JSON.parse(data.content);\nparsed.version"
}
```

**`inspect_tool`** — Returns the full JSON schema for a sandbox function. The LLM uses this to understand a function's parameters before writing code that calls it.

```json
{ "tool_id": "read_file" }
```

### Context Injection

The plugin also injects a context item listing all available functions with their signatures:

```
You can execute JavaScript using the `run_code` tool. The following
functions are available inside the sandbox:

- read_file(path: string): string — Read a file's contents
- write_file(path: string, content: string): void — Write content to a file
- query_db(sql: string, limit?: number): array — Execute a SQL query

Use `inspect_tool` to get the full schema for any function.
```

Signatures are derived from each tool's JSON Schema (`properties`, `type`, `required`). Required parameters appear first; optional parameters are marked with `?`.

## Architecture

### Channel-Based Sync Bridge

QuickJS is single-threaded and runs on `tokio::task::spawn_blocking`. Tool invocations need access to the host's `ToolContext` (state, extensions, events), which lives on the async side. A channel pair bridges the two:

```
┌─────────────────────┐          ┌──────────────────────┐
│  spawn_blocking      │          │  Host loop (async)   │
│                      │          │  (owns ToolContext)   │
│  QuickJS Runtime     │          │                       │
│  ┌────────────────┐  │  req_tx  │                       │
│  │ JS: read_file() ├──┼────────►│ find tool, invoke,    │
│  │    (blocks on   │  │         │ send result back      │
│  │     response)   │◄─┼─────────┤                       │
│  └────────────────┘  │ oneshot  │                       │
│                      │          │                       │
└─────────────────────┘          └──────────────────────┘
```

1. JS calls `read_file({path: "foo.txt"})`
2. The generated wrapper calls `__tool_call("read_file", JSON.stringify(input))`
3. `__tool_call` is a Rust function that sends a `ToolCallRequest` via `mpsc::Sender::blocking_send` and blocks on `oneshot::Receiver::blocking_recv`
4. The host loop receives the request, finds the tool, invokes it async, and sends the result back
5. `__tool_call` returns the JSON-stringified result; the wrapper `JSON.parse`s it back

When the sandbox finishes, it drops the sender, which causes the host loop's `recv()` to return `None`, ending the loop.

### Tool Ownership

During `prepare()`, the sandbox plugin drains all tools and moves them into the `RunCodeInvoke` struct. No `Arc`, no `Mutex`, no changes to `Tool`:

```rust
let drained: Vec<Tool> = ctx.tools.drain(..).collect();
let descriptors: Vec<ToolDescriptor> = drained.iter().map(Into::into).collect();

ctx.tools.push(Tool {
    id: "run_code".into(),
    invoke: Box::new(RunCodeInvoke {
        sandbox: self.sandbox.clone(),
        tools: drained,        // owned Vec<Tool>, no sharing
    }),
    ..
});
```

In the host loop inside `RunCodeInvoke::invoke()`, tool calls are sequential (QuickJS is single-threaded), so `&self.tools` is borrowed without contention.

## Crate Structure

```
crates/sandbox-code/src/
├── lib.rs          Re-exports
├── quickjs.rs      CodeSandbox trait + QuickJS implementation
├── plugin.rs       SandboxPlugin (Plugin impl)
├── run_code.rs     RunCodeInvoke (ToolInvoke impl)
├── inspect.rs      InspectToolInvoke (ToolInvoke impl)
└── listing.rs      Function listing generator from ToolDescriptors
```

### Key Types

| Type | Module | Description |
|------|--------|-------------|
| `CodeSandbox` | `quickjs` | Trait abstracting the JS execution engine |
| `QuickJsSandbox` | `quickjs` | QuickJS-based implementation of `CodeSandbox` |
| `SandboxPlugin` | `plugin` | Plugin that drains tools and exposes `run_code` + `inspect_tool` |
| `RunCodeInvoke` | `run_code` | ToolInvoke that bridges sandbox execution with host tool invocation |
| `InspectToolInvoke` | `inspect` | ToolInvoke that returns tool descriptor JSON |
| `ToolDescriptor` | `engine::sandbox` | Lightweight serializable tool metadata (no invoke handler) |
| `ToolCallRequest` | `engine::sandbox` | Request from sandbox to host, carrying a oneshot response channel |
| `SandboxResult` | `engine::sandbox` | Return value + captured console output |

## Usage

```rust
use std::sync::Arc;
use aperture_sandbox_code::{QuickJsSandbox, SandboxPlugin};

let mut engine = Engine::new();

// Register domain plugins first — they contribute tools.
engine.register(Box::new(FilesystemPlugin::new())).await?;
engine.register(Box::new(DatabasePlugin::new())).await?;

// SandboxPlugin must be last — it drains all tools from prior plugins.
let sandbox = Arc::new(QuickJsSandbox::new());
engine.register(Box::new(SandboxPlugin::new(sandbox))).await?;
```

## Sandbox Environment

### Available Globals

| Global | Description |
|--------|-------------|
| `console.log(…)` | Captures output. Strings pass through; objects are `JSON.stringify`'d. |
| `JSON` | Standard JSON parse/stringify. |
| `<tool_name>(input)` | One function per drained tool. Takes an object, returns the tool's result. |

### Execution Model

- Scripts execute synchronously — tool calls block until the host returns a result
- `await` on tool calls is a no-op (they return values, not Promises), but is harmless
- The script's final expression is the return value
- Uncaught exceptions produce a structured error with message, stack trace, and any console output captured before the crash

### Return Format

Success:
```json
{
  "value": "<script return value>",
  "console_output": ["line1", "line2"]
}
```

Error (returned to the LLM as a tool result, not thrown):
```json
{
  "error": "ReferenceError: foo is not defined\n    at <eval>:3:5",
  "console_output": ["debug info before crash"]
}
```

## Extending

The `CodeSandbox` trait allows alternative sandbox implementations:

```rust
#[async_trait]
pub trait CodeSandbox: Send + Sync {
    async fn execute(
        &self,
        code: &str,
        tools: &[ToolDescriptor],
        tool_caller: mpsc::Sender<ToolCallRequest>,
    ) -> Result<SandboxResult>;
}
```

Pass a different `Arc<dyn CodeSandbox>` to `SandboxPlugin::new()` to swap the execution engine (e.g., a Deno-based sandbox, a WASM-based interpreter, or a mock for testing).
