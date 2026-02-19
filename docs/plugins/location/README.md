# Location Plugin

The location plugin tracks user coordinates over time and injects the latest known location into prompt context. It doesn't provide any tools — location data is written by other plugins (e.g., home-assistant) via `LocationService`.

## Registration

```typescript
import { locationPlugin } from '@morten-olsen/agentic-location';

await pluginService.register(locationPlugin);
```

No configuration options. Plugin ID: `'location'`.

## Available Tools

None. This is a context-only plugin.

## Context Injection

On each prompt, if a location is available for the current user, the plugin adds:

```
User location: lat=59.329, lng=18.068 (captured at 2026-02-19T08:30:00.000Z)
```

## Programmatic Usage

Other plugins update location via `LocationService`:

```typescript
import { LocationService } from '@morten-olsen/agentic-location';

const locationService = services.get(LocationService);

// Store a new location entry
await locationService.updateLocation('alice', 59.329, 18.068);

// Retrieve the most recent location
const latest = await locationService.getLatest('alice');
// { user_id, latitude, longitude, captured_at }
```

## Database

Database ID: `location`

### `location_entries`

| Column       | Type         | Notes                       |
|--------------|--------------|-----------------------------|
| `user_id`    | varchar(255) | User identifier             |
| `latitude`   | real         | Latitude coordinate         |
| `longitude`  | real         | Longitude coordinate        |
| `captured_at`| text         | ISO 8601 timestamp          |

Entries are append-only. `getLatest()` returns the most recent row per user ordered by `captured_at`.

## Dependencies

- `@morten-olsen/agentic-core` — plugin definitions
- `@morten-olsen/agentic-database` — database creation and DatabaseService
