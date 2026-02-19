# Notification Plugin

The notification plugin provides a notification delivery system using an event emitter pattern. The agent sends notifications via the `trigger.notify` tool, and delivery plugins (like telegram) subscribe to the `'published'` event to route messages to users.

## Registration

The notification plugin doesn't have a standalone plugin registration — it exports `NotificationService` and `notifyTool` for use by other plugins (like trigger).

```typescript
import { NotificationService, notifyTool } from '@morten-olsen/agentic-notification';
```

## Available Tools

### `trigger.notify`

Send a notification to the user. The `userId` is automatically set from the prompt context.

```typescript
// Input
{
  title: "Stock Alert",               // max 100 characters
  body: "AAPL dropped 7% today",      // max 1000 characters
  urgency: "high"                      // optional: low, medium, high, critical
}

// Output
{ sent: true }
```

## Event System

The `NotificationService` extends `EventEmitter` and emits a `'published'` event whenever `trigger.notify` is called:

```typescript
const notificationService = services.get(NotificationService);

notificationService.on('published', (notification) => {
  // notification: { userId, title, body, urgency? }
  sendTelegramMessage(notification.userId, `${notification.title}\n\n${notification.body}`);
});
```

Delivery plugins subscribe to this event during their setup phase.

## Dependencies

- `@morten-olsen/agentic-core` — tool definitions and EventEmitter
