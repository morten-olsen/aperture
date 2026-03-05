# Event System

The framework uses a typed pub/sub event system for inter-component communication. All events flow through the `EventBus`, which provides typed publishing, subscribing, and wildcard listening. The `EventBus` is owned by the `Engine` and made available through `SetupContext`, `PrepareContext`, and `ToolContext`.

## Core Concepts

### Defining Events

Events are defined as typed descriptors that pair a string ID with a Rust type:

```rust
pub struct EventDescriptor<T: Serialize + DeserializeOwned + Send + 'static> {
    pub id: &'static str,
    _phantom: PhantomData<T>,
}

// Define an event
pub const MY_ACTION_EVENT: EventDescriptor<MyActionPayload> = EventDescriptor::new("my-plugin.action");

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MyActionPayload {
    pub entity_id: String,
    pub action: String,
}
```

Convention: namespace event IDs as `{plugin}.{action}` (e.g., `prompt.completed`, `notification.published`).

### Publishing Events

```rust
let event_bus = ctx.events;
event_bus.publish(
    &MY_ACTION_EVENT,
    MyActionPayload {
        entity_id: "123".into(),
        action: "created".into(),
    },
    EventOptions { user_id: Some("alice".into()) },
);
```

The `EventOptions` carry metadata about the event context. `user_id` is used for routing events to specific users (e.g., SSE streams).

### Subscribing to Events

```rust
let event_bus = ctx.events;
event_bus.subscribe(&MY_ACTION_EVENT, |payload, options| {
    println!("Entity {} was {}", payload.entity_id, payload.action);
});
```

#### Cancellation

Subscriptions return a handle that can be used to unsubscribe:

```rust
let handle = event_service.subscribe(&MY_ACTION_EVENT, |payload, options| {
    // ...
});

// Later:
handle.unsubscribe();
```

Or use a cancellation token:

```rust
let token = CancellationToken::new();
event_service.subscribe_with_token(&MY_ACTION_EVENT, token.clone(), |payload, options| {
    // ...
});

// Later:
token.cancel(); // listener removed
```

### Wildcard Listening

`listen_all()` fires on every published event — useful for logging, metrics, or bridging to external systems:

```rust
event_service.listen_all(|event_id, payload_json, options| {
    println!("Event: {} - {:?}", event_id, payload_json);
});
```

## Built-in Events

### Prompt Events

Published by the agent loop during prompt execution:

| Event | ID | Payload |
|-------|-----|---------|
| `PROMPT_CREATED` | `prompt.created` | `{ prompt_id, user_id }` |
| `PROMPT_OUTPUT` | `prompt.output` | `{ prompt_id, output: PromptOutput }` |
| `PROMPT_APPROVAL_REQUESTED` | `prompt.approval-requested` | `{ prompt_id, tool_call_id, tool_id, input, reason }` |
| `PROMPT_COMPLETED` | `prompt.completed` | `{ prompt_id, outputs: Vec<PromptOutput>, usage }` |
| `PROMPT_ERROR` | `prompt.error` | `{ prompt_id, error: String }` |

## Event Registration

Plugins register their events with the `EventBus` during `setup()`:

```rust
async fn setup(&mut self, ctx: &mut SetupContext) -> Result<()> {
    ctx.events.register_event(&MY_ACTION_EVENT);
    Ok(())
}
```

Registration makes the event discoverable via `EventBus::registered_events()`.

## Implementation

The event system is built on `tokio::sync::broadcast` channels internally:

- Each event ID gets a broadcast channel
- Publishing sends to the channel; all subscribers receive a clone
- Wildcard listeners subscribe to a special "all events" channel
- Payloads are serialized to `serde_json::Value` for the broadcast (type safety is enforced at the API boundary via `EventDescriptor<T>`)

## Plugin Event Pattern

```rust
// In your plugin's service
pub const ITEM_CREATED_EVENT: EventDescriptor<ItemCreatedPayload> =
    EventDescriptor::new("my-plugin.item-created");

impl MyPluginService {
    pub async fn create_item(&self, events: &EventBus, input: CreateItemInput) -> Result<Item> {
        let item = /* create the item */;

        events.publish(
            &ITEM_CREATED_EVENT,
            ItemCreatedPayload { item_id: item.id.clone() },
            EventOptions { user_id: Some(input.user_id) },
        );

        Ok(item)
    }
}
```

## Design Guidelines

1. **Namespace event IDs** — `{plugin}.{action}` format.
2. **Keep payloads minimal** — Include IDs and essential data. Listeners can fetch details from services.
3. **Use events for side effects** — Don't use events as the primary data flow. They're for notifications and reactions.
4. **Register events in `setup()`** — So they're discoverable.
