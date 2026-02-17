# Calendar Plugin

The calendar plugin syncs events from CalDAV servers (NextCloud, iCloud, etc.) into the agent's context. It supports multi-calendar setups, recurring event expansion via RRULE, and lets the agent annotate events with notes. Optionally injects today's agenda into every prompt.

## Registration

```typescript
import { createCalendarPlugin } from '@morten-olsen/agentic-calendar';

const plugin = createCalendarPlugin({
  sources: [
    {
      id: 'work',
      name: 'Work Calendar',
      url: 'https://nextcloud.example.com/remote.php/dav',
      auth: { username: 'user', password: process.env.CALDAV_PASSWORD! },
      syncIntervalMinutes: 10,
      color: '#4285f4',
    },
  ],
  defaultSyncIntervalMinutes: 15,
  injectTodayAgenda: true,
  expansionWindow: {
    pastMonths: 6,
    futureMonths: 12,
  },
});
await pluginService.register(plugin);
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `sources` | required | Array of CalDAV source configs |
| `defaultSyncIntervalMinutes` | `15` | Fallback sync interval per source |
| `injectTodayAgenda` | `false` | Add today's events to every prompt context |
| `expansionWindow.pastMonths` | `6` | How far back to expand recurring events |
| `expansionWindow.futureMonths` | `12` | How far ahead to expand recurring events |

Each source requires `id`, `name`, `url`, and `auth: { username, password }`. Optional: `syncIntervalMinutes`, `color`.

## Available Tools

### `calendar.list`

Lists all configured calendar sources with sync status.

```typescript
// input
{}
// output
[{ id, name, color, lastSyncedAt }]
```

### `calendar.search`

Searches events by text query and/or date range. Matches against summary, description, and location.

```typescript
{
  query: "standup",           // optional
  calendarId: "work",        // optional — filter to one source
  from: "2026-02-01T00:00:00Z",  // optional
  to: "2026-02-28T23:59:59Z",    // optional
  limit: 20                  // optional, default 20
}
```

### `calendar.get`

Gets a single event by UID, including all attached notes.

```typescript
{ uid: "abc-123" }
```

### `calendar.addNote`

Adds a note to an event.

```typescript
{ eventUid: "abc-123", content: "Prep: review Q4 numbers" }
```

### `calendar.updateNote`

Updates an existing note.

```typescript
{ noteId: "note-456", content: "Updated prep notes" }
```

### `calendar.deleteNote`

Deletes a note. Throws if the note doesn't exist.

```typescript
{ noteId: "note-456" }
```

## Sync Mechanism

The `CalendarSyncService` handles CalDAV synchronization:

1. **On setup**: performs an initial sync of all sources, then starts periodic timers
2. **Per sync**: connects via `tsdav`, fetches `.ics` objects using calendar-multiget REPORT (falls back to PROPFIND + individual GET)
3. **Change detection**: compares ETags — only re-parses changed objects
4. **RRULE expansion**: uses the `rrule` library to expand recurring events within the configured time window. Each occurrence gets a unique UID: `{masterUid}_{YYYYMMDD}`
5. **Upsert**: inserts or updates events by UID using Kysely's `onConflict`
6. **Cleanup**: deletes events whose `masterUid` no longer appears in the sync (removed on server)

Sync errors are logged but non-fatal — the next interval retries automatically.

## Database

Database ID: `calendar`. Two tables:

**`calendar_events`** — synced events (PK: `uid`)

Key columns: `uid`, `master_uid`, `calendar_id`, `summary`, `description`, `location`, `start_at`, `end_at`, `all_day`, `is_recurring`, `raw_ical`, `etag`, `synced_at`

Indexes on `calendar_id`, `start_at`, `master_uid`.

**`calendar_notes`** — agent-authored event annotations (PK: `id`)

Columns: `id`, `event_uid`, `content`, `created_at`, `updated_at`

## Today's Agenda Injection

When `injectTodayAgenda: true`, the prepare hook queries today's events and adds them as a context item. The agent sees a formatted agenda with times and locations at the start of each prompt.
