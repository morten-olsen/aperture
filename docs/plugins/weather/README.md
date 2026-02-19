# Weather Plugin

The weather plugin fetches current weather conditions using the Open-Meteo API. It requires latitude/longitude coordinates, typically obtained from the location plugin.

## Registration

```typescript
import { weatherPlugin } from '@morten-olsen/agentic-weather';

await pluginService.register(weatherPlugin);
```

No configuration options. Plugin ID: `'weather'`. Uses the public Open-Meteo API — no API key required.

## Available Tools

### `weather.get-weather`

Get current weather conditions for a location.

```typescript
// Input
{
  latitude: 59.329,
  longitude: 18.068
}

// Output
{
  temperature: 3.2,          // Celsius
  windSpeed: 12.5,           // km/h
  windDirection: 220,        // degrees
  weatherCode: 3,            // WMO weather code
  description: "Overcast"    // human-readable
}
```

### Weather Codes

The plugin maps WMO weather codes to descriptions:

| Code | Description              |
|------|--------------------------|
| 0    | Clear sky                |
| 1–3  | Mainly clear / Partly cloudy / Overcast |
| 45, 48 | Fog / Depositing rime fog |
| 51–57 | Drizzle (light to freezing) |
| 61–67 | Rain (slight to freezing) |
| 71–77 | Snowfall (slight to snow grains) |
| 80–86 | Showers (rain and snow)  |
| 95–99 | Thunderstorm (with/without hail) |

## Dependencies

- `@morten-olsen/agentic-core` — plugin and tool definitions
- `openmeteo` — Open-Meteo API client
