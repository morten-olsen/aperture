# Trigger Plugin

The trigger plugin lets agents schedule future invocations of themselves. Triggers fire on a one-time or recurring (cron) schedule, running a background agent session with a predefined goal. The scheduler uses **croner** for precise timer-based scheduling — no polling required.

## Registration

```typescript
import { createTriggerPlugin, triggerPlugin } from '@morten-olsen/agentic-trigger';

// Default (no notify handler)
await pluginService.register(triggerPlugin);

// With notification support
const plugin = createTriggerPlugin({
  notifyHandler: async ({ title, body, urgency }) => {
    await sendTelegramMessage(`${title}\n\n${body}`);
  },
});
await pluginService.register(plugin);
```

## Available Tools

### `trigger.create`

Creates a new trigger with a name, goal, model, and schedule. The trigger is automatically scheduled upon creation.

```typescript
{
  name: "Daily Briefing",
  goal: "Summarize calendar, weather, and news",
  model: "gpt-4",
  schedule: { type: "cron", expression: "0 8 * * 1-5" },
  setupContext: "User wants weekday morning briefings",
  maxInvocations: 100,     // optional
  endsAt: "2026-12-31T00:00:00Z"  // optional
}
```

### `trigger.list`

Lists triggers, optionally filtered by status.

```typescript
{ status: "active", limit: 10 }
```

### `trigger.update`

Updates a trigger. In trigger-invoked sessions, `triggerId` defaults to the current trigger. Changing `schedule` or `status` automatically reschedules the job.

```typescript
{
  triggerId: "...",          // optional in trigger sessions
  name: "Updated Name",
  model: "gpt-4o",          // optional
  continuation: "Found 3 items last run",
  status: "paused"
}
```

### `trigger.delete`

Deletes a trigger and all associated records. Stops any active scheduling job.

```typescript
{ triggerId: "..." }  // optional in trigger sessions
```

### `trigger.notify`

Sends a notification to the user. Only available in trigger-invoked sessions.

```typescript
{
  title: "Stock Alert",
  body: "AAPL dropped 7% today",
  urgency: "high"  // optional: low, medium, high, critical
}
```

## Trigger-Invoked Sessions

When the scheduler fires a trigger, it creates a prompt session with trigger state:

```typescript
const state = {
  trigger: {
    from: { id: triggerId, type: 'cron' }
  }
};
```

The plugin detects this state and:

1. Injects context with the trigger's goal, setup context, and continuation
2. Provides pre-bound update/delete tools (no ID needed)
3. Adds the notify tool (if handler configured)

## Continuation Pattern

Agents can persist notes across invocations:

```
Run 1: Checks API → finds delay → notifies user
  continuation: "Notified about 15min delay on 8:30 train"

Run 2: Same delay → reads continuation → skips notification
  continuation: "Still delayed. Already notified."

Run 3: Delay cleared → notifies user
  continuation: "Delays cleared. Notified user."
```

Set `continuation` to `null` to clear it.

## Auto-Scheduling

The `TriggerScheduler` automatically fires triggers on schedule. During `setup()`, the plugin loads all triggers from the database and starts the scheduler. Each trigger gets a **croner** `Cron` job:

- **Cron triggers**: `new Cron(expression, { protect: true }, callback)` — croner handles recurring scheduling, `protect` prevents overlapping runs
- **Once triggers**: `new Cron(new Date(at), callback)` — fires once at the specified datetime. Past datetimes fire immediately.

The scheduler manages the full lifecycle:

1. **On fire**: calls `invoke(id)` which creates a `PromptCompletion` using the trigger's `model`
2. **On success**: `markInvoked()` + `recordInvocation()`, then:
   - Once triggers → auto-complete and clear job
   - Cron triggers → check `maxInvocations`/`endsAt` termination, update `nextInvocationAt`
3. **On failure**: `markFailed()` tracks consecutive failures. After 3 failures, status becomes `'failed'` and the job is cleared.

### Manual invocation

You can still invoke a trigger manually with an optional model override:

```typescript
const scheduler = services.get(TriggerScheduler);

// Uses trigger's model
const prompt = await scheduler.invoke(triggerId);

// Override model for this invocation
const prompt = await scheduler.invoke(triggerId, 'gpt-4o');
```

### Lifecycle methods

```typescript
scheduler.start();  // Schedule all active triggers (called automatically during setup)
scheduler.stop();   // Stop all active jobs (for graceful shutdown)
```
