# Tools

Tools are **model-facing** functions — the capabilities the LLM sees and can call during a conversation. Each tool has an ID, a description for the model, JSON schemas for input/output, and an async invoke function.

Tools are distinct from [services](./services.md), which are internal APIs shared between plugins.

## Tool Definition

```rust
pub struct Tool {
    /// Unique identifier. Convention: `{plugin}.{action}` (e.g., `trigger.create`).
    pub id: String,

    /// Description shown to the model. Be concise about what the tool does.
    pub description: String,

    /// JSON Schema describing the tool's input parameters.
    pub input_schema: serde_json::Value,

    /// JSON Schema describing the tool's output.
    pub output_schema: serde_json::Value,

    /// Optional approval gate. If set, the agent loop pauses for human approval.
    pub require_approval: Option<ApprovalRequirement>,

    /// The function that executes the tool.
    pub invoke: Box<dyn ToolInvoke>,
}
```

## The ToolInvoke Trait

Tool invocation is defined as a trait to support both native closures and WASM-bridged calls:

```rust
#[async_trait]
pub trait ToolInvoke: Send + Sync {
    async fn invoke(&self, ctx: ToolContext) -> Result<serde_json::Value>;
}
```

The `ToolContext` provides everything a tool needs:

| Field | Type | Description |
|-------|------|-------------|
| `input` | `serde_json::Value` | The validated input from the model (parsed JSON). |
| `state` | `&mut State` | Plugin state manager. Read/write any plugin's state. |
| `extensions` | `&Extensions` | The type map for accessing services from other plugins. |
| `events` | `&EventBus` | The event bus for publishing events. |
| `user_id` | `&str` | The user who initiated the prompt. |

## Creating Tools (Native)

Native tools can access services from the extensions type map:

```rust
pub fn search_tool() -> Tool {
    Tool {
        id: "notes.search".into(),
        description: "Search notes by keyword".into(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "query": { "type": "string" },
                "limit": { "type": "integer", "default": 10 }
            },
            "required": ["query"]
        }),
        output_schema: json!({
            "type": "object",
            "properties": {
                "results": { "type": "array" }
            }
        }),
        require_approval: None,
        invoke: Box::new(SearchInvoke),
    }
}

struct SearchInvoke;

#[async_trait]
impl ToolInvoke for SearchInvoke {
    async fn invoke(&self, ctx: ToolContext) -> Result<serde_json::Value> {
        // Access a service registered by another plugin
        let note_service = ctx.extensions.get::<NoteService>()
            .expect("NoteService not registered");

        let query = ctx.input["query"].as_str().unwrap();
        let limit = ctx.input["limit"].as_u64().unwrap_or(10);
        let results = note_service.search(query, limit as usize).await?;

        Ok(serde_json::to_value(results)?)
    }
}
```

### Using Closures

For simpler tools, a closure wrapper can avoid the boilerplate:

```rust
// A helper that wraps an async closure into a Tool
pub fn tool_fn<F, Fut>(id: &str, description: &str, schema: ToolSchema, f: F) -> Tool
where
    F: Fn(ToolContext) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<serde_json::Value>> + Send,
{
    // ... wraps the closure in a ToolInvoke impl
}
```

## Creating Tools (WASM)

WASM plugin tools are invoked by calling back into the guest component:

```
Model calls tool "my-wasm-plugin.search"
  → Host finds the WasmPluginHost that owns this tool
  → Host calls guest.invoke-tool("my-wasm-plugin.search", input_json)
  → Guest executes (may call host.call-service() internally)
  → Guest returns result JSON
  → Host returns result to agent loop
```

The tool definitions (id, description, schemas) come from the guest's `prepare()` export. The invocation is bridged by the `WasmPluginHost`.

## Input/Output Schemas

Schemas are JSON Schema objects. For native Rust tools, you can generate them from Rust types using `schemars`:

```rust
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, JsonSchema)]
pub struct SearchInput {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

#[derive(Serialize, JsonSchema)]
pub struct SearchOutput {
    pub results: Vec<SearchResult>,
}

fn default_limit() -> u32 { 10 }

// Generate JSON Schema at tool creation time
let input_schema = serde_json::to_value(schemars::schema_for!(SearchInput)).unwrap();
```

For WASM tools, schemas are provided as JSON strings by the guest plugin.

## Making Tools Available

Tools are contributed during the plugin's `prepare()` phase:

```rust
async fn prepare(&self, ctx: &mut PrepareContext) -> Result<()> {
    // Always available
    ctx.add_tool(list_tool());
    ctx.add_tool(create_tool());

    // Conditionally available based on state
    let state = ctx.state.get::<MyState>(self.id())?;
    if state.map_or(false, |s| s.has_active_item) {
        ctx.add_tool(update_tool());
        ctx.add_tool(delete_tool());
    }

    Ok(())
}
```

## Human Approval

Tools can require human approval before execution. When approval is needed, the agent loop pauses, records a `pending` result, and emits an event. External systems (UI, API) approve or reject, and the loop resumes.

### Static Approval

The tool always requires approval:

```rust
Tool {
    require_approval: Some(ApprovalRequirement::Always {
        reason: "This permanently deletes data.".into(),
    }),
    ..
}
```

### Dynamic Approval

Approval depends on the input. The closure receives both the input and an `ApprovalContext` with access to extensions and the user ID:

```rust
Tool {
    require_approval: Some(ApprovalRequirement::Dynamic(Box::new(|input, ctx| {
        let amount = input["amount"].as_f64().unwrap_or(0.0);
        if amount > 100.0 {
            Some(format!("Sending ${amount} requires approval."))
        } else {
            None
        }
    }))),
    ..
}
```

The `ApprovalContext` provides:

| Field | Type | Description |
|-------|------|-------------|
| `extensions` | `&Extensions` | The type map — access services to make approval decisions |
| `user_id` | `&str` | The user who initiated the prompt |

This enables approval logic that depends on runtime state, such as checking CLI rules for a user:

```rust
ApprovalRequirement::Dynamic(Box::new(move |input, ctx| {
    let config = config.clone();
    let command = input["command"].as_str()?;
    let rules = load_rules(&config.configs_dir(ctx.user_id).join("cli-rules.toml")).ok()?;
    match check_command(&rules, command) {
        CommandCheck::Allowed { .. } => None,
        CommandCheck::Denied { pattern } => Some(format!("BLOCKED: {pattern}")),
        CommandCheck::Unmatched => Some(format!("No allow rule for: {command}")),
    }
}))
```

### Approval Lifecycle

1. Model calls a tool with `require_approval`
2. Framework evaluates the requirement
3. If approval needed: record `pending` result, set prompt state to `waiting_for_approval`, emit `prompt.approval-requested` event
4. External code calls `approve(tool_call_id)` or `reject(tool_call_id, reason)`
5. On approve: invoke the tool, replace pending with result, resume loop
6. On reject: replace pending with error, resume loop

## Tool Execution Flow

During the agent loop:

1. `prepare()` is called on all plugins, collecting tools
2. Tools are converted to the LLM provider's function format (JSON Schema parameters)
3. Model decides whether to call a tool
4. If it does:
   - Parse arguments from JSON
   - Evaluate `require_approval` if present
   - Call `invoke()` with the `ToolContext`
   - Record the result (success or error)
   - Feed the result back to the model
5. Model can call more tools or produce a text response

## Structured Tool Errors

Tools can return errors with structured data using `EngineError::ToolError`. Unlike plain `ToolInvocation` errors, the data object's keys become properties on the JS Error in the code sandbox:

```rust
Err(EngineError::tool_error(
    "command failed with exit code 1",
    json!({
        "stdout": "...",
        "stderr": "error: mismatched types",
        "exit_code": 1,
    }),
))
```

In the code sandbox, this becomes:

```javascript
try {
    cli_exec({ command: "cargo build" });
} catch (e) {
    e.message;   // "command failed with exit code 1"
    e.stderr;    // "error: mismatched types"
    e.exit_code; // 1
}
```

The `ToolError` variant flows through the existing `Result<Value>` channel. Plain `ToolInvocation(String)` errors continue to work as before — `ToolError` is an additive change.

## Design Guidelines

1. **Tools are for the model** — If only other plugins need to call it, make it a [service](./services.md), not a tool.
2. **Namespace IDs** — Use `{plugin}.{action}` format (`trigger.create`, `skill.list`).
3. **Write clear descriptions** — The description is the model's guide for when/how to use the tool.
4. **Keep tools focused** — One tool, one job. Prefer multiple specific tools over one general-purpose tool.
5. **Return structured data** — Return JSON objects, not strings. The model interprets structured data better.
6. **Let errors propagate** — The framework catches errors and reports them back to the model as error results.

### Designing Tools for the Code Sandbox

When the [code sandbox](./code-sandbox.md) is active, tools become JavaScript functions. The input schema directly controls how these functions look and behave — getting the schema right is critical for the LLM to call tools correctly on the first try.

#### Schema shapes the calling convention

The sandbox generates JS wrappers that accept both positional arguments and a single object argument. The `properties` and `required` fields in the input schema determine the function signature the LLM sees in the listing:

```rust
// Schema:
json!({
    "type": "object",
    "properties": {
        "path": { "type": "string" },
        "content": { "type": "string" }
    },
    "required": ["path", "content"]
})

// LLM sees:     fs_write(path: string, content: string)
// Both work:    fs_write("file.txt", "hello")
//               fs_write({path: "file.txt", content: "hello"})
```

Required parameters become positional args **in `required` array order**, then optional parameters follow alphabetically. This order matters — put the most important parameter first.

#### Return the simplest useful shape

If a tool conceptually returns a single value, return it directly rather than wrapping it in an object. The LLM will try to use return values inline in expressions:

```rust
// Bad: wrapping forces the LLM to know the shape
Ok(json!({"unix_timestamp": now}))
// LLM writes: new Date(get_current_time().unix_timestamp * 1000)
// ...but often guesses wrong: new Date(get_current_time() * 1000) → NaN

// Good: direct value works in expressions naturally
Ok(json!(now))
// LLM writes: new Date(get_current_time() * 1000) ✓
```

When the return value is genuinely multi-field (like `fs_read` returning `{content: "..."}` or `fs_list` returning `{entries: [...]}`), that's fine — the structure carries useful information. The rule is: don't add a wrapper object around a single value.

#### Descriptions should hint at the return shape

The listing shows parameter types but limited return type information. When a tool returns structured data, mention the shape in the description so the LLM doesn't need an `inspect_tool` round-trip:

```rust
// Vague — LLM must guess or inspect
"List entries in a directory."

// Clear — LLM can write code immediately
"List entries in a directory. Returns {entries: [{name, type}]}."
```

#### Empty `properties` means no parameters

Use `"properties": {}` (not omitting `properties` entirely) for parameterless tools. This produces a clean `get_time()` signature in the listing instead of `get_time(input: object)`.
