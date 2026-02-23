# Calendar Plugin

The calendar plugin syncs events from CalDAV servers (NextCloud, iCloud, etc.) into the agent's context. It uses the connection system so users can add calendars conversationally. It supports multi-calendar setups, recurring event expansion via RRULE, and lets the agent annotate events with notes. Optionally injects today's agenda into every prompt.

## Registration

```typescript
import { calendarPlugin } from '@morten-olsen/agentic-calendar';

await pluginService.register(calendarPlugin, {
  defaultSyncIntervalMinutes: 15,
  injectTodayAgenda: true,
  expansionWindow: {
    pastMonths: 6,
    futureMonths: 12,
  },
});
```

Calendar sources are configured at runtime via the connection system — users create `caldav` connections through the `configuration.connections.create` tool. Each connection stores a CalDAV URL, username, and a secret reference to the password.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `defaultSyncIntervalMinutes` | `15` | Sync interval for each connection |
| `injectTodayAgenda` | `false` | Add today's events to every prompt context |
| `expansionWindow.pastMonths` | `6` | How far back to expand recurring events |
| `expansionWindow.futureMonths` | `12` | How far ahead to expand recurring events |

### Connection Fields

When a user creates a `caldav` connection, the following fields are required:

| Field | Description |
|-------|-------------|
| `url` | CalDAV server URL |
| `username` | CalDAV username |
| `passwordSecretId` | Secret ID referencing the CalDAV password |

## Available Tools

Tools are only injected when the current user has at least one `caldav` connection.

### `calendar.list`

Lists all configured calendar connections with sync status.

```typescript
// input
{}
// output
[{ id, name, lastSyncedAt }]
```

### `calendar.search`

Searches events by text query and/or date range. Matches against summary, description, and location. All results are scoped to the current user.

```typescript
{
  query: "standup",           // optional
  calendarId: "conn-uuid",   // optional — filter to one connection
  from: "2026-02-01T00:00:00Z",  // optional
  to: "2026-02-28T23:59:59Z",    // optional
  limit: 20                  // optional, default 20
}
```

### `calendar.get`

Gets a single event by UID, including all attached notes. Only returns events belonging to the current user.

```typescript
{ uid: "abc-123" }
```

### `calendar.addNote`

Adds a note to an event. The event must belong to the current user.

```typescript
{ eventUid: "abc-123", content: "Prep: review Q4 numbers" }
```

### `calendar.updateNote`

Updates an existing note. The note must belong to the current user.

```typescript
{ noteId: "note-456", content: "Updated prep notes" }
```

### `calendar.deleteNote`

Deletes a note. Throws if the note doesn't exist or doesn't belong to the current user.

```typescript
{ noteId: "note-456" }
```

## Sync Mechanism

The `CalendarSyncService` handles CalDAV synchronization:

1. **On prepare**: for each of the user's `caldav` connections, checks if data is stale (older than `defaultSyncIntervalMinutes`). If stale, resolves credentials via `ConnectionService.resolve()` and syncs.
2. **Periodic**: starts a background timer per connection that re-syncs at the configured interval.
3. **Per sync**: connects via `tsdav`, fetches `.ics` objects using calendar-multiget REPORT (falls back to PROPFIND + individual GET).
4. **Change detection**: compares ETags — only re-parses changed objects.
5. **RRULE expansion**: uses the `rrule` library to expand recurring events within the configured time window. Each occurrence gets a unique UID: `{masterUid}_{YYYYMMDD}`.
6. **Upsert**: inserts or updates events by UID using Kysely's `onConflict`.
7. **Cleanup**: deletes events whose `masterUid` no longer appears in the sync (removed on server).

Sync errors are logged but non-fatal — the next interval retries automatically.

## Database

Database ID: `calendar`. Two tables:

**`calendar_events`** — synced events (PK: `uid`)

Key columns: `uid`, `master_uid`, `calendar_id` (connection UUID), `user_id`, `summary`, `description`, `location`, `start_at`, `end_at`, `all_day`, `is_recurring`, `raw_ical`, `etag`, `synced_at`

Indexes on `calendar_id`, `start_at`, `master_uid`, `user_id`.

**`calendar_notes`** — agent-authored event annotations (PK: `id`)

Columns: `id`, `event_uid`, `user_id`, `content`, `created_at`, `updated_at`

Indexes on `event_uid`, `user_id`.

## Today's Agenda Injection

When `injectTodayAgenda: true`, the prepare hook queries today's events (scoped by user) and adds them as a context item. The agent sees a formatted agenda with times and locations at the start of each prompt.
