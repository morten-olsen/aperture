# State

State provides per-plugin, per-conversation storage that persists across tool calls within a conversation. It enables tools and plugins to track information during an agent loop session.

## How State Works

Each plugin has a unique `id`. The `State` struct stores data keyed by plugin ID as `serde_json::Value`. Plugins read and write their own state during `prepare()` and tool invocations.

```
┌────────────────────────────────────────┐
│ State                                  │
│                                        │
│  "trigger"   → { "from": { ... } }    │
│  "skills"    → { "active": ["a","b"] }│
│  "my-plugin" → { "counter": 5 }       │
└────────────────────────────────────────┘
```

State is created fresh for each conversation session and lives for the duration of that session's agent loop.

## Reading State

```rust
// In prepare() or tool invoke()
let state: Option<MyPluginState> = ctx.state.get::<MyPluginState>("my-plugin")?;

// State may be None on first access
let count = state.map_or(0, |s| s.counter);
```

The generic `get::<T>()` deserializes the stored JSON value into the requested Rust type. Returns `None` if no state has been set for that plugin ID.

## Writing State

```rust
// In a tool's invoke()
ctx.state.set("my-plugin", &MyPluginState {
    counter: count + 1,
    last_updated: Some(Utc::now().to_rfc3339()),
})?;
```

The value is serialized to `serde_json::Value` and stored. If the type can't be serialized, `set()` returns an error.

## State in Plugins

### Reading in `prepare()`

A common pattern is changing behavior based on current state:

```rust
async fn prepare(&self, ctx: &mut PrepareContext) -> Result<()> {
    let skill_state = ctx.state.get::<SkillState>(self.id())?;
    let active = skill_state.map_or_else(Vec::new, |s| s.active);

    // Use state to determine which tools to contribute
    for skill_id in &active {
        if let Some(skill_tools) = self.skill_service.tools_for(skill_id) {
            for tool in skill_tools {
                ctx.add_tool(tool);
            }
        }
    }

    Ok(())
}
```

### Initializing in `prepare()`

```rust
async fn prepare(&self, ctx: &mut PrepareContext) -> Result<()> {
    let current = ctx.state.get::<MyState>(self.id())?;
    if current.is_none() {
        ctx.state.set(self.id(), &MyState { counter: 0 })?;
    }
    Ok(())
}
```

## State in Tools

Tools access state through their `ToolContext`:

```rust
async fn invoke(&self, ctx: ToolContext) -> Result<serde_json::Value> {
    let current = ctx.state.get::<CounterState>("counter")?;
    let new_count = current.map_or(0, |s| s.count) + 1;

    ctx.state.set("counter", &CounterState {
        count: new_count,
        last_updated: Utc::now().to_rfc3339(),
    })?;

    Ok(json!({ "count": new_count }))
}
```

## State Lifecycle

1. **Creation** — State is initialized when a prompt execution begins, optionally from initial values passed by the conversation layer
2. **Per-prompt** — The same state object is shared across all tool calls and plugin prepare phases within a single prompt execution
3. **Scope** — State does not automatically persist between separate prompts (the conversation layer manages history and can carry state forward)

## Implementation

```rust
pub struct State {
    data: HashMap<String, serde_json::Value>,
}

impl State {
    pub fn get<T: DeserializeOwned>(&self, plugin_id: &str) -> Result<Option<T>> {
        match self.data.get(plugin_id) {
            Some(value) => Ok(Some(serde_json::from_value(value.clone())?)),
            None => Ok(None),
        }
    }

    pub fn set<T: Serialize>(&mut self, plugin_id: &str, value: &T) -> Result<()> {
        self.data.insert(plugin_id.to_string(), serde_json::to_value(value)?);
        Ok(())
    }
}
```

## Design Guidelines

1. **Keep state minimal** — Only store what's needed for the current session. Use databases for persistent storage.
2. **Handle `None`** — `get()` returns `None` before the first `set()`. Always provide defaults.
3. **Use typed state structs** — Define `#[derive(Serialize, Deserialize)]` structs for your plugin's state shape rather than working with raw JSON.
4. **Prefer immutable updates** — Create a new state value rather than mutating in place.
