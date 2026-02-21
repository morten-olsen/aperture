# Event System

The framework uses a centralized, Zod-validated event system for all inter-component communication. All events flow through `EventService` — a singleton service that provides typed pub/sub with wildcard listening and abort signal support.

## Core Concepts

### Creating Events

Events are declared with `createEvent()`, which pairs a string ID with a Zod schema:

```typescript
import { z } from 'zod';
import { createEvent } from '@morten-olsen/agentic-core';

const myPluginActionEvent = createEvent({
  id: 'my-plugin.action',
  schema: z.object({
    entityId: z.string(),
    action: z.enum(['created', 'deleted']),
  }),
});
```

Namespace event IDs as `{plugin}.{action}` (e.g., `prompt.completed`, `notification.published`).

### Registering Events

Plugins register their events with `EventService` during `setup()`:

```typescript
const eventService = services.get(EventService);
eventService.registerEvent(myPluginActionEvent);
```

Registration makes the event discoverable via `getEvents()` and the `GET /api/events` endpoint.

### Publishing Events

```typescript
eventService.publish(
  myPluginActionEvent,
  { entityId: '123', action: 'created' },
  { userId: 'alice' },
);
```

The third argument is `EventOptions` — currently `{ userId?: string }`. When `userId` is set, the SSE bridge automatically forwards the event to that user's connected clients.

### Listening to Events

```typescript
eventService.listen(myPluginActionEvent, (data, options) => {
  console.log(data.entityId); // typed as string
  console.log(options.userId); // typed as string | undefined
});
```

#### AbortSignal Support

Pass an `AbortSignal` to automatically unsubscribe:

```typescript
const controller = new AbortController();
eventService.listen(myPluginActionEvent, handler, {
  abortSignal: controller.signal,
});
// Later:
controller.abort(); // listener removed
```

### Wildcard Listening

`listenAll()` fires on every published event — used internally by the SSE bridge:

```typescript
const cleanup = eventService.listenAll((eventId, data, options) => {
  console.log(`Event: ${eventId}`, data);
});
// cleanup() to unsubscribe
```

### Event Registration Callbacks

`onEventRegistered()` fires whenever a new event is registered — used by ApiService to auto-expose events:

```typescript
const cleanup = eventService.onEventRegistered((event) => {
  console.log(`New event: ${event.id}`);
});
```

## Built-in Events

### Prompt Events

Registered by `PromptService` on first access. All include `userId` in `EventOptions`.

| Event | ID | Schema |
|---|---|---|
| `promptCreatedEvent` | `prompt.created` | `{ promptId, userId }` |
| `promptOutputEvent` | `prompt.output` | `{ promptId, output: PromptOutput }` |
| `promptApprovalRequestedEvent` | `prompt.approval-requested` | `{ promptId, request: ApprovalRequestedEvent }` |
| `promptCompletedEvent` | `prompt.completed` | `{ promptId, output: PromptOutput[], usage?: PromptUsage }` |
| `promptErrorEvent` | `prompt.error` | `{ promptId, error: string }` |

### Notification Events

Registered by `NotificationService` on first access.

| Event | ID | Schema |
|---|---|---|
| `notificationPublishedEvent` | `notification.published` | `TriggerNotifyInput` (`{ userId, title, body, urgency? }`) |

## SSE Bridge

The API plugin automatically bridges all EventService events to SSE clients:

1. `ApiService.startSseBridge()` calls `eventService.listenAll()`
2. For each event with a `userId` in options, the event is forwarded to all SSE connections for that user
3. The SSE event name matches the event ID (e.g., `prompt.completed`)
4. The SSE data is the JSON-serialized event data

Clients connect via `GET /api/events/stream` with an `X-User-Id` header.

## API Endpoints

### List Events

```
GET /api/events
```

Returns all registered events with their JSON schemas:

```json
{
  "events": [
    {
      "id": "prompt.completed",
      "schema": { "type": "object", "properties": { "..." } }
    }
  ]
}
```

### SSE Stream

```
GET /api/events/stream
X-User-Id: alice
```

Establishes an SSE connection. All events published with `{ userId: 'alice' }` are forwarded to this connection.

## Plugin Event Registration

Plugins define and register their own events following this pattern:

```typescript
// my-plugin/src/service/service.ts
import { EventService, createEvent } from '@morten-olsen/agentic-core';

const myEvent = createEvent({
  id: 'my-plugin.something-happened',
  schema: z.object({ ... }),
});

class MyPluginService {
  constructor(services: Services) {
    const eventService = services.get(EventService);
    eventService.registerEvent(myEvent);
  }

  doSomething = () => {
    const eventService = this.#services.get(EventService);
    eventService.publish(myEvent, { ... }, { userId });
  };
}

export { myEvent, MyPluginService };
```

The event is automatically exposed via `GET /api/events` and forwarded over SSE.
