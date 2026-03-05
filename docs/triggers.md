# Triggers

Triggers let the agent schedule itself — fire at specific times or on cron schedules, execute the agent goal, and carry state forward via continuation messages. Triggers are stored as JSON files in the user's workspace under `.triggers/`, managed by the agent through filesystem tools and by clients through actions. A background scheduler watches for changes and fires triggers when they come due.

## Workspace Layout

```
{data_root}/{user_id}/workspace/
└── .triggers/
    ├── daily-report.json
    ├── hourly-check.json
    └── one-time-setup.json
```

Each `.json` file in `.triggers/` is a trigger. The filename (without `.json`) serves as the trigger's ID — `daily-report.json` has ID `daily-report`.

## Trigger Schema

```json
{
  "name": "daily-report",
  "goal": "Generate a daily summary of project activity",
  "schedule_type": "cron",
  "schedule_value": "0 0 9 * * * *",
  "status": "active",
  "setup_script": "fetch_data()",
  "max_invocations": 100,
  "ends_at": "2026-12-31T23:59:59Z",
  "continuation": "Yesterday's report covered Q4 revenue trends.",
  "invocation_count": 5,
  "last_invoked_at": "2026-03-04T09:00:00Z",
  "next_invocation_at": "2026-03-05T09:00:00Z",
  "consecutive_failures": 0,
  "last_error": null
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier, must match the filename |
| `goal` | string | The prompt input sent to the agent when the trigger fires |
| `schedule_type` | string | `"once"` for one-shot or `"cron"` for recurring |
| `schedule_value` | string | ISO 8601 datetime for `once`, cron expression for `cron` |
| `status` | string | One of `active`, `paused`, `completed`, `failed` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `setup_script` | string | Code to execute before the agent runs (reserved for future use) |
| `max_invocations` | integer | Stop after this many invocations (cron only) |
| `ends_at` | string | ISO 8601 datetime after which the trigger completes (cron only) |
| `continuation` | string | Carried forward between invocations — the agent's last text output becomes the next invocation's continuation |

### Managed Fields

These are updated by the scheduler and should not be set manually:

| Field | Type | Description |
|-------|------|-------------|
| `invocation_count` | integer | Total times the trigger has fired |
| `last_invoked_at` | string | ISO 8601 timestamp of the last invocation |
| `next_invocation_at` | string | ISO 8601 timestamp of the next scheduled invocation |
| `consecutive_failures` | integer | Resets to 0 on success, increments on failure |
| `last_error` | string | Error message from the most recent failure |

## Schedule Types

### One-shot (`once`)

Fires once and transitions to `completed`. If the `schedule_value` datetime is in the past, the trigger fires immediately on the next scheduler tick.

```json
{
  "name": "send-welcome",
  "goal": "Send the welcome email to the new user",
  "schedule_type": "once",
  "schedule_value": "2026-03-05T14:00:00Z",
  "status": "active"
}
```

### Cron (`cron`)

Fires on a recurring schedule using [7-field cron expressions](https://docs.rs/cron/latest/cron/) (seconds, minutes, hours, day-of-month, month, day-of-week, year):

```json
{
  "name": "hourly-digest",
  "goal": "Summarize the last hour of activity",
  "schedule_type": "cron",
  "schedule_value": "0 0 * * * * *",
  "status": "active",
  "max_invocations": 720
}
```

Cron triggers terminate when any of these conditions is met:
- `max_invocations` reached
- `ends_at` datetime passed
- `consecutive_failures` reaches 3 (status transitions to `failed`)
- Status is changed to `paused` or `completed` externally

## Status Lifecycle

```
        ┌──────────────────────────────────────┐
        │                                      ▼
   ┌────────┐    fire/complete     ┌───────────────┐
   │ active │─────────────────────▶│   completed   │
   └────────┘                      └───────────────┘
     │    ▲
     │    │  resume
     ▼    │
   ┌────────┐
   │ paused │
   └────────┘

   ┌────────┐    3 consecutive     ┌───────────────┐
   │ active │──────failures───────▶│    failed      │
   └────────┘                      └───────────────┘
```

- **active** — Scheduler will fire this trigger on schedule
- **paused** — Scheduler ignores it; can be resumed by setting status back to `active`
- **completed** — Terminal state; one-shot triggers auto-complete, cron triggers complete when termination conditions are met
- **failed** — Terminal state; reached after 3 consecutive failures

## Continuations

The agent's final text output from each invocation is saved as the trigger's `continuation` field. On the next invocation, this text is injected as context so the agent can build on its previous work.

This enables stateful recurring tasks without external storage — a daily report trigger can reference yesterday's findings, a monitoring trigger can track trends across invocations.

## File Validation

Writes to `.triggers/*.json` are validated against the `Trigger` schema before hitting disk. This applies whether the write comes from:

- The agent using `fs_write` — goes through `FileValidationService`
- The `update_trigger` action — goes through `validated_write`

Invalid JSON or schema mismatches are rejected with an error returned to the caller. The `FileValidationService` is registered by `TriggerPlugin` during `setup()`.

## Actions

Client-facing actions for managing triggers outside the agent loop:

| Action | Input | Description |
|--------|-------|-------------|
| `list_triggers` | `{ user_id }` | List all triggers for a user |
| `get_trigger` | `{ name }` | Read a single trigger by name |
| `update_trigger` | `{ name, ...fields }` | Modify fields on an existing trigger (status, goal, schedule_value, continuation) |
| `delete_trigger` | `{ name }` | Remove a trigger file from disk |
| `reload_triggers` | `{}` | Re-scan all `.triggers/` directories from disk — use after external filesystem edits |

The `reload_triggers` action is for when trigger files are modified directly on the filesystem outside the agent (e.g., manually editing JSON files or syncing from another system). It tells the scheduler to re-read everything from disk and reconcile its in-memory state.

## Events

| Event | ID | Payload | When |
|-------|----|---------|------|
| `TRIGGER_FIRED` | `trigger.fired` | `{ name, user_id }` | Scheduler begins executing a trigger |
| `TRIGGER_COMPLETED` | `trigger.completed` | `{ name, user_id, continuation }` | Agent run finishes successfully |
| `TRIGGER_FAILED` | `trigger.failed` | `{ name, user_id, error, consecutive_failures }` | Agent run errors |
| `TRIGGER_UPDATED` | `trigger.updated` | `{ name, user_id }` | Trigger file is modified (by action or scheduler) |
| `TRIGGER_STATUS_CHANGED` | `trigger.status_changed` | `{ name, old_status, new_status }` | Status field transitions |

## Scheduler

`TriggerScheduler` runs as a background tokio task, started after the `PromptRunner` is available:

```rust
let scheduler = engine.get_extension::<Arc<TriggerScheduler>>().unwrap();
let runner: Arc<dyn PromptRunner> = /* ... */;
scheduler.start(runner);
```

The scheduler's main loop uses `tokio::select!` between two sources:

1. **Timer** — sleeps until the nearest trigger's fire time, then fires all due triggers
2. **File events** — listens for `FILE_VALIDATED_WRITE` events on `.triggers/` paths and reconciles in-memory state

### Fire Flow

When a trigger fires:

1. Read the trigger file from disk
2. Build a `State` with `TriggerState { name, schedule_type }` under the `"trigger"` key
3. Call `runner.run_with_state(user_id, &goal, &[], state)`
4. On success: extract continuation from the last `PromptOutput::Text`, reset failure count, increment invocation count, update timestamps
5. On failure: increment `consecutive_failures`, store error. If >= 3, set status to `failed`
6. For `once`: set status to `completed`
7. For `cron`: check `max_invocations` and `ends_at` termination conditions
8. Write updated trigger back to disk
9. Publish `TRIGGER_UPDATED`, `TRIGGER_COMPLETED`/`TRIGGER_FAILED`, and `TRIGGER_STATUS_CHANGED` events

### Self-Write Handling

When the scheduler writes trigger state back to disk, the write goes through `validated_write`, but the scheduler skips validation (it controls the data). The `FILE_VALIDATED_WRITE` event fires, the scheduler receives it, re-reads the file — but since the schedule hasn't changed, it's a no-op reconciliation.

## Plugin Integration

`TriggerPlugin` uses all three lifecycle phases:

### `setup()`
- Registers `.triggers/*.json` validator with `FileValidationService`
- Registers trigger events on the `EventBus`
- Creates `TriggerScheduler` and stores it in extensions
- Registers trigger actions

### `prepare()` (per-prompt)
- Checks `State` for `TriggerState` under the `"trigger"` key
- If present (prompt was fired by a trigger): injects context telling the agent its trigger name, schedule type, and that its final output will be saved as the continuation

### `preflight()` (per-prompt, after tools are finalized)
- Marks that preflight has run (cached in state to avoid re-execution across loop iterations)
- Reserved for future setup script execution via the `run_code` tool

## Plugin Registration

`TriggerPlugin` requires `RuntimeConfig` in extensions:

```rust
engine.register(Box::new(RuntimeConfigPlugin::new(config))).await?;
engine.register(Box::new(FilesystemPlugin)).await?;
engine.register(Box::new(TriggerPlugin)).await?;
```

After the engine is set up and the `PromptRunner` is available, start the scheduler:

```rust
engine.insert_extension(runner.clone());

let scheduler = engine.get_extension::<Arc<TriggerScheduler>>().unwrap();
scheduler.start(runner);
```

## Creating Triggers

Triggers are JSON files — the agent creates them with `fs_write`, and the `FileValidationService` validates the schema before the write completes:

```javascript
// Agent writes a trigger via fs_write (or in a script via run_code):
fs_write({
  path: ".triggers/daily-report.json",
  content: JSON.stringify({
    name: "daily-report",
    goal: "Summarize today's project activity and compare with yesterday",
    schedule_type: "cron",
    schedule_value: "0 0 9 * * * *",
    status: "active"
  }, null, 2)
});
```

The scheduler detects the new file via the `FILE_VALIDATED_WRITE` event and begins scheduling it.

## Crate Structure

```
crates/runtime/src/trigger/
├── mod.rs          TriggerPlugin (setup/prepare/preflight)
├── model.rs        Trigger, TriggerStatus, TriggerState
├── events.rs       Event descriptors and payloads
├── actions.rs      ListTriggers, GetTrigger, DeleteTrigger, UpdateTrigger, ReloadTriggers
├── context.rs      Context injection and preflight helpers
└── scheduler.rs    TriggerScheduler background task
```
