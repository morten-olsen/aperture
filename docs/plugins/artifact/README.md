# Artifact Plugin

The artifact plugin stores and retrieves large structured data produced by tools. When a tool generates a large output, it can store the data as an artifact and return only the ID. The agent (or other tools) can then retrieve the full data on demand via `artifact.get`.

## Registration

```typescript
import { artifactPlugin } from '@morten-olsen/agentic-artifact';

await pluginService.register(artifactPlugin);
```

No configuration options. Plugin ID: `'artifact'`.

## Available Tools

### `artifact.get`

Retrieve the full data of an artifact by its ID.

```typescript
// Input
{ id: "abc-123" }

// Output
{
  id: "abc-123",
  type: "json",
  description: "Search results",
  data: { /* arbitrary JSON */ },
  createdAt: "2026-02-19T12:00:00.000Z"
}
```

## Programmatic Usage

Other plugins and tools store artifacts via `ArtifactService`:

```typescript
import { ArtifactService } from '@morten-olsen/agentic-artifact';

const artifactService = services.get(ArtifactService);

// Store an artifact — returns the generated ID
const id = await artifactService.add({
  type: 'json',
  description: 'Search results',
  data: { results: [...] },
});

// Retrieve an artifact
const artifact = await artifactService.get(id);
```

## Database

Database ID: `artifact`

### `artifact_artifacts`

| Column       | Type         | Notes                                |
|--------------|--------------|--------------------------------------|
| `id`         | varchar(255) | PK — UUID                            |
| `type`       | varchar(255) | Artifact type label                  |
| `description`| text         | Optional human-readable description  |
| `data`       | text         | JSON-stringified payload             |
| `created_at` | text         | ISO 8601 timestamp                   |

## Dependencies

- `@morten-olsen/agentic-core` — plugin and tool definitions
- `@morten-olsen/agentic-database` — database creation and DatabaseService
