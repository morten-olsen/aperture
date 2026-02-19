# Home Assistant Plugin

The home-assistant plugin connects to a Home Assistant instance via WebSocket. It can optionally track user locations by subscribing to device tracker entity updates and feeding coordinates to the location plugin.

## Registration

```typescript
import { createHomeAssistantPlugin } from '@morten-olsen/agentic-home-assistant';

await pluginService.register(
  createHomeAssistantPlugin({
    url: 'http://homeassistant.local:8123',
    token: process.env.HA_TOKEN!,
    locationTracking: [
      { entity: 'device_tracker.alice_phone', userId: 'alice' },
    ],
  }),
);
```

### Options

| Option             | Type                                        | Required | Description                                    |
|--------------------|---------------------------------------------|----------|------------------------------------------------|
| `url`              | `string`                                    | yes      | Home Assistant instance URL                    |
| `token`            | `string`                                    | yes      | Long-lived access token                        |
| `locationTracking` | `{ entity: string; userId: string }[]`      | no       | Entity-to-user mappings for location updates   |

## Available Tools

None. This plugin is purely an integration bridge — it connects to Home Assistant on setup and forwards entity state changes to other services.

## Location Tracking

When `locationTracking` is configured, the plugin:

1. Subscribes to all entity state changes via `subscribeEntities()`
2. Filters for the configured entity IDs
3. Extracts `latitude` and `longitude` from entity attributes
4. Calls `LocationService.updateLocation()` to persist the coordinates

This requires the `@morten-olsen/agentic-location` package to be registered alongside this plugin.

## Dependencies

- `@morten-olsen/agentic-core` — plugin definitions
- `home-assistant-js-websocket` — WebSocket connection to Home Assistant
- `@morten-olsen/agentic-location` — optional, required for location tracking
