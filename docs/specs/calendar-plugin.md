# Calendar Plugin Spec

## Overview

A CalDAV-backed calendar plugin that periodically syncs events from one or more remote calendars into a local database and exposes tools for the agent to search events, list calendars, and attach notes to events.

## Goals

- **Read-only CalDAV sync** — pull events from remote CalDAV servers on a periodic schedule
- **Multi-calendar support** — each configured calendar source is synced independently
- **Agent-facing tools** — search events, list calendars, read/update notes on events
- **Local persistence** — all synced data lives in the plugin's own database tables

## Non-Goals

- Creating, editing, or deleting events on the remote CalDAV server
- Real-time push/subscription (we poll on a timer)

---

## Configuration

The plugin factory accepts an array of calendar sources:

```typescript
type CalendarSource = {
  id: string;            // stable local identifier, e.g. "work", "personal"
  name: string;          // human-readable label
  url: string;           // CalDAV calendar URL
  auth: {
    username: string;
    password: string;    // app-specific password / token
  };
  syncIntervalMinutes?: number;  // default: 15
  color?: string;        // optional display hint
};

type CalendarPluginOptions = {
  sources: CalendarSource[];
  defaultSyncIntervalMinutes?: number;  // fallback for sources without one
  injectTodayAgenda?: boolean;          // inject today's events as context (default: false)
};
```

Example:

```typescript
createCalendarPlugin({
  sources: [
    {
      id: 'work',
      name: 'Work Calendar',
      url: 'https://caldav.example.com/cal/work',
      auth: { username: 'alice', password: process.env.CALDAV_WORK_PW! },
    },
    {
      id: 'personal',
      name: 'Personal',
      url: 'https://caldav.example.com/cal/personal',
      auth: { username: 'alice', password: process.env.CALDAV_PERSONAL_PW! },
      syncIntervalMinutes: 30,
    },
  ],
});
```

---

## Database

Database ID: `calendar`

### Tables

#### `calendar_events`

Stores the synced event data.

| Column        | Type         | Notes                                          |
|---------------|--------------|-------------------------------------------------|
| `uid`           | varchar(255) | PK — VEVENT UID (for recurring: `{uid}_{date}`) |
| `master_uid`    | varchar(255) | Original VEVENT UID (same as `uid` for non-recurring) |
| `calendar_id`   | varchar(255) | FK to source `id` from config                  |
| `summary`       | text         | Event title                                    |
| `description`   | text         | Event description from VEVENT (nullable)        |
| `location`      | text         | nullable                                       |
| `start_at`      | varchar(255) | ISO 8601 datetime                              |
| `end_at`        | varchar(255) | ISO 8601 datetime                              |
| `all_day`       | integer      | 0/1 boolean                                    |
| `is_recurring`  | integer      | 0/1 — whether this is an expanded recurrence   |
| `recurrence_id` | varchar(255) | RECURRENCE-ID if this is an override (nullable) |
| `raw_ical`      | text         | Full VEVENT text                               |
| `etag`          | varchar(255) | CalDAV ETag for change detection               |
| `synced_at`     | varchar(255) | ISO 8601 timestamp of last sync                |

#### `calendar_notes`

Agent-authored notes attached to events.

| Column      | Type         | Notes                                   |
|-------------|--------------|-----------------------------------------|
| `id`        | varchar(255) | PK — UUID                               |
| `event_uid` | varchar(255) | FK → `calendar_events.uid`              |
| `content`   | text         | Free-form note text                     |
| `created_at`| varchar(255) | ISO 8601                                |
| `updated_at`| varchar(255) | ISO 8601                                |

### Migrations

Single initial migration: `2026-02-15-init`

---

## Sync Service

`CalendarSyncService` — registered as a service via the DI container.

### Responsibilities

1. On `setup()`, run an initial sync for every configured source
2. Start a periodic timer per source (using `setInterval` or a lightweight scheduler)
3. For each sync cycle:
   - Fetch the list of events from the CalDAV server (REPORT or multiget)
   - Compare ETags against stored events
   - Upsert changed/new events, delete events no longer present on server
   - Update `synced_at` timestamps

### CalDAV Client

Use the `tsdav` npm package for CalDAV operations. It handles:
- PROPFIND for calendar discovery
- REPORT / calendar-multiget for event fetching
- ETag-based diffing

### Recurring Event Expansion

During sync, recurring events (those with `RRULE`) are expanded into individual occurrences using the `rrule` npm package:

1. Parse the `RRULE`, `EXDATE`, and any `RECURRENCE-ID` overrides from the VEVENT
2. Expand occurrences over a rolling window (e.g. 6 months past → 12 months future, configurable)
3. Store each occurrence as a separate row in `calendar_events` with:
   - `uid` = `{master_uid}_{YYYYMMDD}` (synthetic, stable per occurrence)
   - `master_uid` = the original VEVENT UID
   - `is_recurring` = 1
   - `recurrence_id` set for override instances
4. On re-sync, delete all expanded rows for a master UID and re-expand (simple and correct)
5. Single/non-recurring events have `uid == master_uid` and `is_recurring = 0`

Notes attached via `calendar_notes.event_uid` use the synthetic per-occurrence UID, so notes survive re-expansion as long as the occurrence date doesn't change.

### Error Handling

Sync errors are non-blocking. If a source fails to sync, the error is logged and the remaining sources continue normally. The agent is not blocked — stale data from the last successful sync remains available.

### Expansion Window Config

```typescript
type CalendarPluginOptions = {
  // ...existing fields...
  expansionWindow?: {
    pastMonths?: number;    // default: 6
    futureMonths?: number;  // default: 12
  };
};
```

---

## Tools

All tool IDs namespaced under `calendar.*`.

### `calendar.list`

List all configured calendars with their last sync time.

- **Input**: (none)
- **Output**: `Array<{ id, name, color?, lastSyncedAt? }>`

### `calendar.search`

Search events by text and/or date range.

- **Input**:
  - `query?: string` — substring match on summary/description/location
  - `calendarId?: string` — filter to a specific calendar source
  - `from?: string` — ISO 8601 start of range
  - `to?: string` — ISO 8601 end of range
  - `limit?: number` — max results (default 20)
- **Output**: `Array<{ uid, calendarId, summary, description, location, startAt, endAt, allDay, isRecurring, notes: Array<{ id, content, createdAt }> }>`
- **Notes**: Results ordered by `start_at` ascending. Includes any attached notes. Recurring events appear as individual occurrences.

### `calendar.get`

Get full details of a single event by UID.

- **Input**: `uid: string`
- **Output**: `{ uid, calendarId, summary, description, location, startAt, endAt, allDay, isRecurring, notes: Array<{ id, content, createdAt, updatedAt }> }`

### `calendar.addNote`

Add a note to an event.

- **Input**:
  - `eventUid: string`
  - `content: string`
- **Output**: `{ id, eventUid, content, createdAt }`

### `calendar.updateNote`

Update an existing note.

- **Input**:
  - `noteId: string`
  - `content: string`
- **Output**: `{ id, eventUid, content, updatedAt }`

### `calendar.deleteNote`

Remove a note.

- **Input**: `noteId: string`
- **Output**: `{ success: boolean }`

---

## Plugin Lifecycle

### `setup()`

1. Register the database (runs migrations)
2. Instantiate `CalendarSyncService` via `services.get()`
3. Trigger initial sync for all sources
4. Start periodic sync timers

### `prepare()`

1. Push all calendar tools to the tool list
2. Add a context item listing available calendars
3. If `injectTodayAgenda` is enabled, fetch today's events and include a summary as context

---

## Package Structure

```
packages/calendar/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── exports.ts
    ├── plugin/
    │   └── plugin.ts            # createCalendarPlugin factory
    ├── database/
    │   └── database.ts          # createDatabase with schema + migrations
    ├── sync/
    │   └── sync.ts              # CalendarSyncService (DI service)
    ├── tools/
    │   ├── tools.ts             # re-export all tools as array
    │   ├── tools.list.ts
    │   ├── tools.search.ts
    │   ├── tools.get.ts
    │   ├── tools.add-note.ts
    │   ├── tools.update-note.ts
    │   └── tools.delete-note.ts
    └── schemas/
        └── schemas.ts           # shared Zod schemas (event, note, inputs)
```

### Dependencies

- `@morten-olsen/agentic-core` — plugin/tool/services types
- `@morten-olsen/agentic-database` — database creation + DatabaseService
- `tsdav` — CalDAV client
- `zod` — schema validation
- `rrule` — RRULE expansion for recurring events
- `uuid` (or `crypto.randomUUID`) — note IDs

---

## Context Contribution

In `prepare()`, the plugin can optionally inject a brief context summary:

```
You have access to the user's calendars: Work, Personal.
Use the calendar.* tools to search events and manage notes.
```

This keeps the agent aware that calendar tools exist without flooding context.

---

## Design Decisions

1. **Today's agenda injection** — opt-in via `injectTodayAgenda: boolean` in config (default `false`). When enabled, `prepare()` queries today's events and adds them as a context item.
2. **Recurring events** — fully expanded during sync using the `rrule` package over a configurable rolling window. Each occurrence is a separate row with a synthetic stable UID. See *Recurring Event Expansion* above.
3. **Sync error handling** — non-blocking. Failed sources are logged; remaining sources sync normally. Stale data from the last successful sync remains queryable.
