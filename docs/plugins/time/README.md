# Time Plugin

The time plugin injects the current local time and timezone into every prompt as context. No tools, no database — purely contextual.

## Registration

```typescript
import { timePlugin } from '@morten-olsen/agentic-time';

await pluginService.register(timePlugin);
```

No configuration options. Plugin ID: `'time'`.

## Available Tools

None. This is a context-only plugin.

## Context Injection

On each prompt, the plugin adds:

```
The current time is 2026-02-19 08:30:00 (timezone: Europe/Stockholm)
```

The timezone is detected from the host system via `Intl.DateTimeFormat().resolvedOptions().timeZone`. Time is formatted in `sv-SE` locale (ISO-like: `YYYY-MM-DD HH:MM:SS`).

## Dependencies

- `@morten-olsen/agentic-core` — plugin definitions
