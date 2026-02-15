# 001: Trigger System

**Status**: Implemented

## Overview

The trigger system enables agents to schedule future invocations of themselves. When a trigger fires, the scheduler runs a background agent session with the trigger's goal using the trigger's configured model. The agent can notify users via a pluggable handler and track state across invocations via continuation notes.

## Scope

The `@morten-olsen/agentic-trigger` package provides:

- Database schema and migrations
- Repository layer (CRUD + persistence)
- Scheduler with built-in timer management via **croner**
- Agent tools (create, update, delete, list, invoke, notify)
- Plugin wiring (context injection, tool management, auto-start scheduling)

The scheduler handles the full lifecycle: scheduling triggers, firing them at the right time, managing `next_invocation_at`, and handling termination conditions. No external orchestrator is needed for scheduling.

## Data Model

### Triggers Table (`triggers_triggers`)

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Human-readable name |
| goal | TEXT | What the agent should accomplish |
| model | TEXT | Model ID to use when invoking this trigger |
| schedule_type | TEXT | 'once' or 'cron' |
| schedule_value | TEXT | ISO8601 datetime or cron expression |
| status | TEXT | 'active', 'paused', 'completed', 'failed' |
| setup_context | TEXT | Why this trigger exists (injected as context) |
| invocation_count | INTEGER | Times fired |
| last_invoked_at | TEXT | Last fire time |
| next_invocation_at | TEXT | Computed by scheduler from croner `.nextRun()` |
| continuation | TEXT | State note from last invocation |
| continuation_updated_at | TEXT | When continuation was last set |
| max_invocations | INTEGER | Stop after N fires (nullable) |
| ends_at | TEXT | Stop after datetime (nullable) |
| last_error | TEXT | Most recent error |
| consecutive_failures | INTEGER | Reset on success, auto-fail at 3 |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last modification |

### Prompts Junction (`triggers_prompts`)

| Column | Type | Description |
|--------|------|-------------|
| trigger_id | TEXT | FK to triggers |
| prompt_id | TEXT | FK to prompts |
| invoked_at | TEXT | When the trigger fired |

## Scheduler API

The `TriggerScheduler` manages both in-memory trigger state and croner `Cron` jobs.

### Lifecycle

- `load()` — Populate in-memory cache from database
- `start()` — Schedule all active triggers (creates croner jobs)
- `stop()` — Stop all active croner jobs (for graceful shutdown)

### CRUD

- `create(input)` — Insert trigger, add to cache, schedule job. Input requires `model` field.
- `get(id)` — Return trigger or undefined (from cache)
- `list({ status?, limit? })` — Filtered list (default limit 50)
- `update(id, changes)` — Partial update, returns updated record. If `schedule` or `status` changes, the job is rescheduled.
- `delete(id)` — Clear job, remove from DB + cache

### Invocation

- `invoke(id, model?)` — Create and run a prompt session. Uses `trigger.model` by default; optional `model` parameter overrides it.
- `markInvoked(id)` — Reset failures, increment count, set lastInvokedAt
- `markFailed(id, error)` — Increment failures, auto-fail at 3, clear job on failure
- `recordInvocation(triggerId, promptId)` — Create junction record

### Scheduling Behavior

- **Cron triggers**: `new Cron(expression, { protect: true }, callback)` — croner handles recurring scheduling, `protect` prevents overlapping runs
- **Once triggers**: `new Cron(new Date(at), callback)` — fires once at the specified datetime. Past datetimes fire immediately.
- On successful invocation of a **once** trigger: auto-completes and clears job
- On successful invocation of a **cron** trigger: checks `maxInvocations`/`endsAt` termination, updates `nextInvocationAt`
- On 3 consecutive failures: status becomes `'failed'`, job is cleared

## Tool Definitions

| Tool ID | Description | Availability |
|---------|-------------|-------------|
| trigger.create | Create a new trigger (requires `model`) | Always |
| trigger.list | List triggers with optional filters | Always |
| trigger.update | Update trigger fields (including `model`) | Always (ID required in normal sessions, optional in trigger sessions) |
| trigger.delete | Delete a trigger | Always (same ID pattern as update) |
| trigger.invoke | Return trigger details for manual invocation context | Always (normal sessions) |
| trigger.notify | Send notification to user | Trigger-invoked sessions only |

### Tool Factories

`createUpdateTool(currentTriggerId?)` and `createDeleteTool(currentTriggerId?)` produce tools that default to the current trigger's ID when pre-bound. `createNotifyTool(handler)` wraps a transport-agnostic callback.

## Plugin Behavior

### Setup

During `setup()`, the plugin:
1. Initializes the database (runs migrations)
2. Calls `scheduler.load()` to populate the in-memory cache
3. Calls `scheduler.start()` to schedule all active triggers

### Normal Sessions

All standard tools (create, list, update, delete, invoke) are pushed. No trigger context is injected.

### Trigger-Invoked Sessions

State must contain `{ trigger: { from: { id, type } } }`. The plugin:

1. Pushes create + list from standard tools
2. Pushes pre-bound update + delete (triggerId defaults to current)
3. Pushes notify tool (if notifyHandler configured)
4. Injects context with goal, setupContext, continuation, and instructions

### Context Injection

```
You are running from a scheduled trigger. The user will not see this conversation directly.

Your goal: [trigger.goal]

Context: [trigger.setupContext]

Note from your previous invocation:
"[trigger.continuation]"

If you discover something the user should know, use the trigger.notify tool.
Before completing, use trigger.update with a "continuation" note for your next invocation.
```

## Continuation Pattern

Agents write a continuation note at the end of each run to inform future invocations. This enables:

- **Change detection**: Skip notifications for previously-reported conditions
- **Threshold tracking**: Monitor values relative to baselines
- **Accumulation**: Collect items across runs for periodic digests

Set `continuation` to a string to update, or `null` to clear.

## Error Handling

- After 3 consecutive failures (`markFailed`), trigger status is set to `failed` and the croner job is cleared
- `markInvoked` resets the failure counter
- Notification failures don't affect trigger status (best-effort delivery)

## Configuration

`createTriggerPlugin(options?)` accepts:

- `notifyHandler?: (input: { title, body, urgency? }) => Promise<void>` — Transport-agnostic notification callback

The default `triggerPlugin` export has no notify handler configured.

## External Dependencies

- **croner** — Timer management for cron expressions and one-shot scheduling
