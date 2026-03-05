# Plugin System

Plugins are the primary extension mechanism. A plugin can contribute tools (model-facing), register services (internal APIs for other plugins), inject system context, manage state, and initialize resources. Everything beyond the basic agent loop is a plugin.

## The Plugin Trait

```rust
#[async_trait]
pub trait Plugin: Send + Sync {
    /// Unique, stable identifier. Used as the state storage key.
    fn id(&self) -> &str;

    /// Human-readable name (optional).
    fn name(&self) -> Option<&str> { None }

    /// Description of what this plugin does (optional).
    fn description(&self) -> Option<&str> { None }

    /// Called once when the plugin is registered.
    /// Use for service registration, event listener setup, initialization.
    async fn setup(&mut self, ctx: &mut SetupContext) -> Result<()> { Ok(()) }

    /// Called before each prompt in the agent loop.
    /// Contribute tools, context items, and read/write state.
    async fn prepare(&self, ctx: &mut PrepareContext) -> Result<()> { Ok(()) }
}
```

## Lifecycle

### Registration (`setup`)

Called once when the plugin is registered via `Engine::register()`. Use it for:

- Registering services in the extensions type map (for other plugins to consume)
- Registering tools in the global tool registry
- Setting up event listeners
- Validating configuration
- Initializing resources

```rust
async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
    // Register a service for other plugins to use
    let ha_service = HomeAssistantService::new(&self.config);
    ctx.extensions.insert(ha_service);

    // Register tools in the global registry
    ctx.registry.register(ha_list_devices_tool());
    ctx.registry.register(ha_control_device_tool());

    // Subscribe to events
    ctx.events.subscribe(&SOME_EVENT, |payload, _| {
        // React to events
    });

    Ok(())
}
```

### Preparation (`prepare`)

Called before every prompt in the agent loop. The framework creates a `PrepareContext` that accumulates tools, context items, and state across all plugins. Each plugin receives mutable access to this context.

```rust
async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
    // Add system context
    ctx.add_context_item(ContextItem {
        item_type: "instruction".into(),
        id: None,
        content: "You have access to home automation.".into(),
    });

    // Activate tools registered during setup()
    ctx.activate_tool("ha.list_devices")?;
    ctx.activate_tool("ha.control_device")?;

    Ok(())
}
```

## SetupContext

The `SetupContext` provides access to engine infrastructure during plugin registration:

| Field | Type | Description |
|-------|------|-------------|
| `extensions` | `&mut Extensions` | Type map for registering services. |
| `events` | `&EventBus` | The event bus for subscribing to events. |
| `registry` | `&mut ToolRegistry` | Global tool registry. Register tools here so the engine can look them up by ID. |

## PrepareContext

The `PrepareContext` provides everything a plugin needs during the prepare phase:

| Field | Type | Description |
|-------|------|-------------|
| `tools` | `&mut Vec<Tool>` | Tool list. Add model-facing tools for this prompt. |
| `context` | `&mut Vec<ContextItem>` | System context items. Converted to system messages in the model call. |
| `state` | `&mut State` | Plugin state manager. Read/write state scoped by plugin ID. |
| `extensions` | `&Extensions` | Type map for consuming services from other plugins (read-only during prepare). |
| `events` | `&EventBus` | The event bus for publishing/subscribing. |
| `history` | `&[Prompt]` | Conversation history including the current prompt. |
| `registry` | `&ToolRegistry` | Global tool registry (read-only). Use `activate_tool(id)` to activate a registered tool. |

## Context Items

Context items are system-level instructions sent to the model. Each item has a type, optional ID, and content string:

```rust
pub struct ContextItem {
    pub item_type: String,
    pub id: Option<String>,
    pub content: String,
}
```

Plugins push context items during `prepare()`. They are converted to system messages when building the model call.

## Plugin Registration

Plugins are registered through the `Engine`. **Registration order matters** — a plugin that depends on another plugin's service must be registered after it:

```rust
let mut engine = Engine::new();

// HomeAssistant registers its service in setup()
engine.register(Box::new(HomeAssistantPlugin::new(ha_config))).await?;

// HomeAutomation consumes HomeAssistantService in prepare() — must come after
engine.register(Box::new(HomeAutomationPlugin::new())).await?;
```

Registration calls `setup()` on the plugin. If `setup()` returns an error, registration fails.

## Native vs WASM Plugins

### Native Plugins

Implement `Plugin` directly in Rust. Full access to the host and extensions type map:

```rust
pub struct HomeAssistantPlugin {
    config: HaConfig,
}

#[async_trait]
impl Plugin for HomeAssistantPlugin {
    fn id(&self) -> &str { "home-assistant" }
    fn name(&self) -> Option<&str> { Some("Home Assistant") }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        // Register service for other plugins
        let service = HomeAssistantService::new(&self.config);
        ctx.extensions.insert(service);

        // Register tools in the global registry
        ctx.registry.register(ha_list_devices_tool());
        ctx.registry.register(ha_control_device_tool());
        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        // Activate registered tools for this prompt
        ctx.activate_tool("ha.list_devices")?;
        ctx.activate_tool("ha.control_device")?;
        Ok(())
    }
}
```

Another plugin can then consume the service:

```rust
pub struct HomeAutomationPlugin;

#[async_trait]
impl Plugin for HomeAutomationPlugin {
    fn id(&self) -> &str { "home-automation" }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        ctx.registry.register(list_automations_tool());
        ctx.registry.register(toggle_automation_tool());
        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        // Consume the HomeAssistant service (internal, not model-facing)
        let ha = ctx.extensions.get::<HomeAssistantService>()
            .expect("HomeAssistantService not registered");

        // Conditionally activate tools based on runtime state
        let automations = ha.list_automations().await?;
        if !automations.is_empty() {
            ctx.activate_tool("automation.list")?;
            ctx.activate_tool("automation.toggle")?;
        }

        Ok(())
    }
}
```

### WASM Plugins

Loaded via Wasmtime as WASM components. The host provides a `WasmPluginHost` adapter that implements the `Plugin` trait by calling into the guest's exported functions:

```
┌──────────────────────────────────────────────────┐
│ Host (Rust)                                      │
│                                                  │
│  WasmPluginHost                                  │
│  ├── implements Plugin trait                     │
│  ├── holds Wasmtime instance + store             │
│  └── translates Plugin calls → guest exports     │
│       │                                          │
│       ▼                                          │
│  ┌────────────────────────────────────┐          │
│  │ Guest (WASM Component)             │          │
│  │ Exports:                           │          │
│  │   setup()                          │          │
│  │   prepare() → tools, context       │          │
│  │   invoke-tool(id, input) → output  │          │
│  │ Imports:                           │          │
│  │   host.log(msg)                    │          │
│  │   host.get-state() → val           │          │
│  │   host.set-state(val)              │          │
│  │   host.call-service(svc, method,   │          │
│  │                      args) → result│          │
│  └────────────────────────────────────┘          │
└──────────────────────────────────────────────────┘
```

WASM plugins can consume services registered by native plugins via `host.call-service()`, which bridges to the host's extensions type map. The host resolves the service by name and dispatches the method call.

### WIT Interface

The guest/host boundary is defined with WIT (WebAssembly Interface Types):

```wit
package aperture:plugin;

interface host {
    /// Log a message to the host
    log: func(level: log-level, message: string);

    /// Read plugin state (JSON-serialized)
    get-state: func() -> option<string>;

    /// Write plugin state (JSON-serialized)
    set-state: func(value: string);

    /// Call a service registered by another plugin.
    /// This is the WASM equivalent of the Extensions type map.
    /// Returns JSON-serialized result.
    call-service: func(
        service: string,
        method: string,
        args: string
    ) -> result<string, string>;
}

interface guest {
    /// Plugin metadata
    id: func() -> string;
    name: func() -> option<string>;
    description: func() -> option<string>;

    /// Called once at registration
    setup: func() -> result<_, string>;

    /// Called before each prompt. Returns model-facing tools and context.
    prepare: func() -> result<prepare-result, string>;

    /// Called when the model invokes a tool owned by this plugin.
    invoke-tool: func(tool-id: string, input: string) -> result<string, string>;
}

record prepare-result {
    tools: list<tool-definition>,
    context-items: list<context-item>,
}

record tool-definition {
    id: string,
    description: string,
    input-schema: string,   // JSON Schema
    output-schema: string,  // JSON Schema
}

record context-item {
    item-type: string,
    id: option<string>,
    content: string,
}

enum log-level {
    debug,
    info,
    warn,
    error,
}

world plugin {
    import host;
    export guest;
}
```

### WASM Plugin Capabilities

WASM plugins are sandboxed by default. The host can grant additional capabilities:

| Capability | Description | How |
|-----------|-------------|-----|
| State | Read/write plugin-scoped state | `host.get-state` / `host.set-state` |
| Logging | Write to host log | `host.log` |
| Services | Call services registered by other plugins | `host.call-service` |
| HTTP | Make outbound HTTP requests | Optional `wasi:http` import |
| Filesystem | Read/write files | Optional `wasi:filesystem` import |

## Plugin Design Guidelines

1. **Choose a unique `id`** — The ID is used as the state storage key. Keep it stable across versions.
2. **Keep `setup()` fast** — It runs at startup. Tool registration is cheap; defer heavy work to `prepare()` or lazy initialization.
3. **Tools are for the model, services are for plugins** — If the LLM should call it, it's a tool. If another plugin should call it, register it as a service in the extensions type map.
4. **Register tools in `setup()`, activate in `prepare()`** — Register tools in the global registry during `setup()` so the engine can look them up by ID. Activate them conditionally in `prepare()` via `ctx.activate_tool(id)` for progressive disclosure.
5. **Use context items for instructions** — Don't embed instructions in tool descriptions. Use context items for system-level guidance.
6. **Namespace tool IDs** — Prefix with plugin name: `trigger.create`, `skill.activate`.
7. **Registration order matters** — If plugin B depends on plugin A's service, register A first.
