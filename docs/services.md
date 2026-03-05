# Services

Services are **internal APIs** that plugins expose for other plugins to consume. They are not visible to the LLM model — that's what [tools](./tools.md) are for. Services handle inter-plugin communication and shared capabilities.

## The Extensions Type Map

Services are shared through `Extensions`, a type map stored on the `Engine`. It maps Rust types to singleton values using `TypeId` + `Any`. This is the same pattern used in `http::Extensions` (hyper, axum) and `actix_web::Data<T>`.

```rust
pub struct Extensions {
    map: HashMap<TypeId, Box<dyn Any + Send + Sync>>,
}

impl Extensions {
    /// Insert a service. Overwrites any previous value of the same type.
    pub fn insert<T: Send + Sync + 'static>(&mut self, value: T);

    /// Retrieve a service by type. Returns None if not registered.
    pub fn get<T: Send + Sync + 'static>(&self) -> Option<&T>;
}
```

## Registering Services

Plugins register services during `setup()` via the `SetupContext`:

```rust
pub struct HomeAssistantPlugin {
    config: HaConfig,
}

#[async_trait]
impl Plugin for HomeAssistantPlugin {
    fn id(&self) -> &str { "home-assistant" }

    async fn setup(&mut self, ctx: &mut SetupContext) -> Result<()> {
        let service = HomeAssistantService::new(&self.config);
        ctx.extensions.insert(service);
        Ok(())
    }
}
```

## Consuming Services

Other plugins access services during `prepare()` or through tools via `ToolContext`:

```rust
// In prepare()
async fn prepare(&self, ctx: &mut PrepareContext) -> Result<()> {
    let ha = ctx.extensions.get::<HomeAssistantService>()
        .expect("HomeAssistantService not registered");

    let devices = ha.list_devices().await?;
    for device in devices {
        ctx.add_tool(device_control_tool(&device));
    }
    Ok(())
}

// In a tool's invoke()
async fn invoke(&self, ctx: ToolContext) -> Result<serde_json::Value> {
    let ha = ctx.extensions.get::<HomeAssistantService>()
        .expect("HomeAssistantService not registered");

    let result = ha.toggle_device(&device_id).await?;
    Ok(serde_json::to_value(result)?)
}
```

## Registration Order

Registration order determines availability. If plugin B depends on plugin A's service, A must be registered first:

```rust
// ✅ Correct — HA service available when automation registers
engine.register(Box::new(HomeAssistantPlugin::new(config))).await?;
engine.register(Box::new(HomeAutomationPlugin::new())).await?;

// ❌ Wrong — HomeAutomationPlugin can't find HomeAssistantService
engine.register(Box::new(HomeAutomationPlugin::new())).await?;
engine.register(Box::new(HomeAssistantPlugin::new(config))).await?;
```

## WASM Plugin Access

WASM plugins can't access the type map directly (they run in a sandbox). Instead, they consume services through `host.call-service()`, a WIT import that bridges to the host's extensions:

```wit
/// Call a service registered by another plugin.
call-service: func(
    service: string,   // e.g. "home-assistant"
    method: string,    // e.g. "list-devices"
    args: string       // JSON-serialized arguments
) -> result<string, string>;
```

### How call-service Works

For a service to be callable from WASM, it must implement a dispatch trait:

```rust
/// Trait for services that can be called from WASM plugins.
pub trait ServiceDispatch: Send + Sync {
    /// The service name used in call-service().
    fn name(&self) -> &str;

    /// Dispatch a method call. Input and output are JSON.
    async fn dispatch(&self, method: &str, args: serde_json::Value) -> Result<serde_json::Value>;
}
```

The host registers dispatch-capable services in a name-based lookup alongside the type map:

```rust
// In setup()
async fn setup(&mut self, ctx: &mut SetupContext) -> Result<()> {
    let service = HomeAssistantService::new(&self.config);

    // Available to native plugins via type map
    ctx.extensions.insert(service.clone());

    // Available to WASM plugins via call-service dispatch
    ctx.register_service_dispatch(service);

    Ok(())
}
```

When a WASM plugin calls `host.call-service("home-assistant", "list-devices", "{}")`:
1. Host looks up `"home-assistant"` in the dispatch registry
2. Calls `dispatch("list-devices", {})` on the service
3. Returns the JSON result to the guest

### Two Access Paths

```
Native Plugin ──── extensions.get::<T>() ──── direct Rust type access
                                               (compile-time type safety)

WASM Plugin ────── host.call-service() ─────── JSON-serialized dispatch
                                               (runtime name resolution)
```

Native plugins get full type safety. WASM plugins get the same functionality through a serialized interface, consistent with their sandboxed nature.

## Design Guidelines

1. **Services are for plugins, tools are for the model** — If the LLM should call it, make it a tool. If plugins need it, register it as a service.
2. **One service per type** — The type map stores one value per Rust type. Use wrapper types if you need multiple instances of the same underlying service.
3. **Implement `ServiceDispatch` if WASM access is needed** — Not all services need to be WASM-accessible. Only add dispatch for services that WASM plugins should consume.
4. **Keep the interface stable** — WASM plugins reference services by name and method strings. Changing these breaks compatibility.
5. **Register early** — Services should be registered in `setup()` so they're available by the time other plugins run.
