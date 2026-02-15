# Calendar Plugin

CalDAV-backed calendar plugin for the agentic framework. Periodically syncs events from CalDAV servers and provides agent tools for searching, viewing, and annotating events.

## Features

- Multi-calendar CalDAV sync with configurable intervals
- Full RRULE recurring event expansion
- ETag-based change detection
- Agent tools for searching and managing events
- Agent-authored notes on events
- Optional today's agenda injection

## Installation

```bash
pnpm add @morten-olsen/agentic-calendar
```

## Usage

```typescript
import { createCalendarPlugin } from '@morten-olsen/agentic-calendar';

const calendarPlugin = createCalendarPlugin({
  sources: [
    {
      id: 'work',
      name: 'Work Calendar',
      url: 'https://caldav.example.com/calendars/work',
      auth: {
        username: 'user@example.com',
        password: process.env.CALDAV_PASSWORD!,
      },
      syncIntervalMinutes: 15,
    },
  ],
  injectTodayAgenda: true,
  expansionWindow: {
    pastMonths: 6,
    futureMonths: 12,
  },
});
```

## Tools

- `calendar.list` - List all configured calendars
- `calendar.search` - Search events by text/date range
- `calendar.get` - Get event details by UID
- `calendar.addNote` - Add note to an event
- `calendar.updateNote` - Update existing note
- `calendar.deleteNote` - Delete a note

## Architecture

See `docs/specs/calendar-plugin.md` for full specification.
