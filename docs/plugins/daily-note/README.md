# Daily Note Plugin

The daily note plugin provides a simple per-day memory system. The agent can store a note for any date (max 2000 characters) and today's note is automatically injected into context each prompt. Notes are scoped per user to support multi-user deployments.

## Registration

```typescript
import { dailyNotePlugin } from '@morten-olsen/agentic-daily-note';

await pluginService.register(dailyNotePlugin);
```

## Available Tools

### `daily-note.get`

Get the daily note for a specific date. Defaults to today.

```typescript
{ date: "2026-02-19" }  // optional
```

Returns `{ date, content, updatedAt }` where `content` is `null` if no note exists.

### `daily-note.set`

Set the daily note for a specific date. Defaults to today. Overwrites any existing note.

```typescript
{
  date: "2026-02-19",           // optional, defaults to today
  content: "Meeting at 3pm"     // max 2000 characters
}
```

### `daily-note.list`

List daily notes, optionally filtered by date range.

```typescript
{
  from: "2026-02-01",   // optional
  to: "2026-02-28",     // optional
  limit: 14             // optional, default 14, max 100
}
```

Returns `{ notes: [{ date, content, updatedAt }] }` ordered by date descending.

## Context Injection

On every prompt, the plugin fetches today's note for the current user. If a note exists, it is injected as a context item:

```
Today's note (2026-02-19):
Meeting at 3pm. Remember to review PR #42.
```

This allows the agent to be aware of daily context without the user needing to repeat themselves.

## Database

- **Table**: `daily_note_entries`
- **Columns**: `user_id`, `date` (YYYY-MM-DD), `content`, `created_at`, `updated_at`
- **Unique index**: `(user_id, date)` composite key
- **Database ID**: `daily-note`

## Dependencies

- `@morten-olsen/agentic-core` — Plugin and tool system
- `@morten-olsen/agentic-database` — SQLite database via Kysely
- `zod` — Schema validation
