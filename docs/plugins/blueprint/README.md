# Blueprint Plugin

The blueprint plugin stores reusable behavioral patterns ("blueprints") for handling recurring tasks. Each blueprint has a title, use-case criteria, step-by-step process instructions, and optional notes. The plugin uses embedding-based semantic search to automatically suggest relevant blueprints based on the current prompt.

## Registration

```typescript
import { createBlueprintPlugin } from '@morten-olsen/agentic-blueprint';

// Default settings
await pluginService.register(createBlueprintPlugin());

// Custom settings
await pluginService.register(
  createBlueprintPlugin({
    topN: 3,
    maxDistance: 0.5,
  }),
);
```

### Options

| Option        | Type     | Default | Description                                          |
|---------------|----------|---------|------------------------------------------------------|
| `topN`        | `number` | `5`     | Max blueprints to surface in context per prompt       |
| `maxDistance`  | `number` | `0.7`   | Cosine distance threshold for blueprint suggestions   |

## Available Tools

### `blueprint.get`

Fetch a blueprint by ID, including full process and notes.

```typescript
// Input
{ id: "abc-123" }

// Output
{
  id: "abc-123",
  title: "Deploy to production",
  use_case: "When the user asks to deploy a service",
  process: "1. Run tests\n2. Build docker image\n3. Push to registry\n4. Update k8s deployment",
  notes: "Always check staging first",
  created_at: "2026-02-19T12:00:00.000Z",
  updated_at: "2026-02-19T12:00:00.000Z"
}
```

### `blueprint.create`

Create a new blueprint.

```typescript
{
  title: "Deploy to production",
  use_case: "When the user asks to deploy a service",
  process: "1. Run tests\n2. Build docker image\n...",
  notes: "Always check staging first"  // optional
}
```

### `blueprint.update`

Update an existing blueprint. Only provided fields are changed. Changing `title` or `use_case` automatically re-generates the embedding.

```typescript
{
  id: "abc-123",
  title: "Deploy to production (v2)",  // optional
  process: "Updated steps..."          // optional
}
```

### `blueprint.delete`

Delete a blueprint by ID.

```typescript
{ id: "abc-123" }
```

### `blueprint.list`

List all blueprints (returns ID, title, and use_case only).

```typescript
// Input: (none)

// Output
{
  blueprints: [
    { id: "abc-123", title: "Deploy to production", use_case: "When the user asks to deploy..." }
  ]
}
```

## Semantic Search

On each prompt, the plugin:

1. Takes the latest user input and generates an embedding
2. Queries the database for blueprints within the `maxDistance` threshold
3. Caches results per prompt ID to avoid re-embedding on tool-call loops
4. Injects matching blueprint titles into context with instructions to call `blueprint.get` before following them

The search uses cosine distance via `EmbeddingService` and `vectorDistance()`.

## Database

Database ID: `blueprint`

### `blueprint_blueprints`

| Column       | Type         | Notes                                    |
|--------------|--------------|------------------------------------------|
| `id`         | varchar(255) | PK — UUID                                |
| `title`      | varchar(255) | Short descriptive name                   |
| `use_case`   | text         | When to apply this blueprint             |
| `process`    | text         | Step-by-step instructions                |
| `notes`      | text         | Optional scratch pad for observations    |
| `embedding`  | blob         | Serialized vector of title + use_case    |
| `created_at` | text         | ISO 8601 timestamp                       |
| `updated_at` | text         | ISO 8601 timestamp                       |

## Dependencies

- `@morten-olsen/agentic-core` — plugin, tool, and state definitions
- `@morten-olsen/agentic-database` — database creation, EmbeddingService, vectorDistance
