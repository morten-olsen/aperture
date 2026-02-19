# 008: Behavioural Blueprints

**Status**: Draft

## Overview

The `@morten-olsen/agentic-blueprint` package provides a system for the agent to record, recall, and refine how it handles recurring tasks. A **blueprint** captures a proven approach — title, use case, step-by-step process, and working notes — so the agent can reuse it when a similar request comes up again.

Blueprints are surfaced automatically: on each conversation turn the plugin embeds the user's latest message, runs a cosine-similarity search against stored blueprints, and injects the top matches into the agent's context. The agent can then fetch the full blueprint, follow the process, update it when the user's needs evolve, or create new ones when it recognises a task worth remembering.

## Goals

- **Automatic recall** — relevant blueprints appear in context without the user having to ask, via semantic search over embeddings
- **Full lifecycle** — tools to create, read, update, and delete blueprints
- **Incremental refinement** — a dedicated notes field lets the agent track observations and experiments before committing to process changes
- **Low context overhead** — only titles and IDs are injected into context; the agent fetches full details on demand

## Non-Goals

- Automatic blueprint creation (the agent or user must explicitly decide to create one)
- Blueprint versioning or change history
- Sharing blueprints across users (single-tenant for now)
- Approval workflows for blueprint changes

---

## Configuration

```typescript
type BlueprintPluginOptions = {
  topN?: number;           // max blueprints to surface in context (default: 5)
  maxDistance?: number;     // cosine distance threshold — skip results further than this (default: 0.7)
};
```

Example:

```typescript
createBlueprintPlugin({
  topN: 5,
  maxDistance: 0.7,
});
```

---

## Data Model

Database ID: `blueprint`

### Tables

#### `blueprint_blueprints`

| Column       | Type         | Notes                                                  |
|--------------|--------------|--------------------------------------------------------|
| `id`         | varchar(255) | PK — UUID                                              |
| `title`      | varchar(255) | Short name describing what this blueprint handles       |
| `use_case`   | text         | When to apply this blueprint — the matching criteria    |
| `process`    | text         | Step-by-step instructions the agent should follow       |
| `notes`      | text         | Agent scratch pad — observations, experiments, caveats  |
| `embedding`  | blob         | Vector embedding of `title + " — " + use_case`         |
| `created_at` | varchar(255) | ISO 8601 timestamp                                     |
| `updated_at` | varchar(255) | ISO 8601 timestamp                                     |

### Embedding Strategy

The embedding is generated from the concatenation `title + " — " + use_case`. This captures both the "what" (title) and the "when" (use case), giving the best semantic match surface against incoming user requests.

The embedding is regenerated whenever `title` or `use_case` is updated.

### Migrations

Single initial migration: `2026-02-19-init`

---

## Service

### `BlueprintService`

Registered in the DI container. Encapsulates all database access and embedding logic.

```
class BlueprintService {
  constructor(services: Services)

  // Create a new blueprint, generate embedding, store
  create(input: {
    title: string;
    use_case: string;
    process: string;
    notes?: string;
  }): Promise<Blueprint>

  // Fetch a single blueprint by ID
  get(id: string): Promise<Blueprint | undefined>

  // List all blueprints (title + id only, ordered by updated_at desc)
  list(): Promise<{ id: string; title: string; use_case: string }[]>

  // Update one or more fields; re-embeds if title or use_case changed
  update(id: string, changes: {
    title?: string;
    use_case?: string;
    process?: string;
    notes?: string;
  }): Promise<Blueprint>

  // Delete a blueprint
  delete(id: string): Promise<void>

  // Semantic search: embed the query and return closest matches
  search(query: string, options?: {
    limit?: number;
    maxDistance?: number;
  }): Promise<{ id: string; title: string; distance: number }[]>
}
```

**`Blueprint`**:

```typescript
type Blueprint = {
  id: string;
  title: string;
  use_case: string;
  process: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
```

### Search Logic

1. Embed the query string using `EmbeddingService.embed()`
2. Query `blueprint_blueprints` using `vectorDistance('embedding', queryVector)` ordered by ascending distance
3. Filter out results where distance > `maxDistance`
4. Return up to `limit` results with `id`, `title`, and `distance`

---

## Tools

All tool IDs namespaced under `blueprint.*`.

### `blueprint.get`

Fetch the full details of a blueprint.

- **Input**: `{ id: string }`
- **Output**: `{ id, title, use_case, process, notes, created_at, updated_at }`

### `blueprint.create`

Create a new behavioural blueprint.

- **Input**: `{ title: string, use_case: string, process: string, notes?: string }`
- **Output**: `{ id, title, use_case, process, notes, created_at, updated_at }`

### `blueprint.update`

Update one or more fields of an existing blueprint. Re-embeds automatically if `title` or `use_case` changes.

- **Input**: `{ id: string, title?: string, use_case?: string, process?: string, notes?: string }`
- **Output**: `{ id, title, use_case, process, notes, created_at, updated_at }`

### `blueprint.delete`

Delete a blueprint permanently.

- **Input**: `{ id: string }`
- **Output**: `{ deleted: boolean }`

### `blueprint.list`

List all blueprints (summary view).

- **Input**: (none)
- **Output**: `{ blueprints: { id, title, use_case }[] }`

---

## Plugin Lifecycle

### State

```typescript
state: z.object({
  lastSearchPromptId: z.string().optional(),
  suggestedBlueprints: z.array(z.object({
    id: z.string(),
    title: z.string(),
  })).optional(),
})
```

The state caches the most recent semantic search results, keyed by the prompt ID that triggered the search. This avoids redundant embedding API calls during tool-call loops within the same user turn (where `prepare()` is called repeatedly but the user's message hasn't changed).

### `setup()`

1. Initialize database (runs migrations)

### `prepare()`

1. Push all blueprint tools to the tool list
2. Extract the latest user prompt from `prompts` (last entry with an `input` field)
3. If the latest prompt ID matches `state.lastSearchPromptId`, use cached `suggestedBlueprints` — skip to step 6
4. Embed the user's input via `BlueprintService.search()`
5. Store results and prompt ID in plugin state
6. If there are matching blueprints, inject a context item:

```
You have behavioural blueprints for recurring tasks. These may be relevant:

- <id-1>: Blueprint Title 1
- <id-2>: Blueprint Title 2
- <id-3>: Blueprint Title 3

Use blueprint.get to review the full process before following a blueprint.
If you handle a task that could recur, consider creating a blueprint with blueprint.create.
If you improve on an existing blueprint's process, update it with blueprint.update.
Use the notes field to record observations before committing to process changes.
```

7. If there are no matching blueprints, inject a shorter context item:

```
You can create behavioural blueprints to remember how to handle recurring tasks. Use blueprint.create when you solve a task the user might request again.
```

---

## Package Structure

```
packages/blueprint/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── exports.ts
    ├── plugin/
    │   └── plugin.ts              # createBlueprintPlugin factory + plugin definition
    ├── database/
    │   └── database.ts            # createDatabase with schema + migrations
    ├── service/
    │   └── service.ts             # BlueprintService (DI service)
    ├── tools/
    │   ├── tools.ts               # re-export all tools as array
    │   ├── tools.get.ts
    │   ├── tools.create.ts
    │   ├── tools.update.ts
    │   ├── tools.delete.ts
    │   └── tools.list.ts
    └── schemas/
        └── schemas.ts             # shared Zod schemas (Blueprint, inputs)
```

### Dependencies

- `@morten-olsen/agentic-core` — plugin/tool/services types
- `@morten-olsen/agentic-database` — database creation, DatabaseService, EmbeddingService, vector helpers
- `zod` — schema validation

---

## Server Integration

### Config (`packages/server/src/config/config.ts`)

```typescript
blueprint: {
  enabled: {
    doc: 'Enable behavioural blueprints plugin',
    format: Boolean,
    default: true,
    env: 'BLUEPRINT_ENABLED',
  },
  topN: {
    doc: 'Maximum blueprints to surface in context per turn',
    format: 'int',
    default: 5,
    env: 'BLUEPRINT_TOP_N',
  },
  maxDistance: {
    doc: 'Cosine distance threshold for blueprint suggestions (lower = stricter)',
    format: Number,
    default: 0.7,
    env: 'BLUEPRINT_MAX_DISTANCE',
  },
},
```

### Registration

```typescript
if (config.blueprint.enabled) {
  plugins.push(
    createBlueprintPlugin({
      topN: config.blueprint.topN,
      maxDistance: config.blueprint.maxDistance,
    }),
  );
}
```

---

## Design Decisions

1. **Semantic search over keyword matching** — blueprints should match based on intent, not exact wording. A user asking "set up my weekly standup reminder" should match a blueprint titled "Create recurring calendar triggers" even though they share no keywords. Embedding-based cosine similarity handles this naturally.

2. **Context injection with on-demand fetch** — injecting full blueprint content into every prompt would waste tokens and pollute the context. Instead, only titles and IDs are injected. The agent decides whether a blueprint is relevant enough to fetch, keeping context lean. This scales well as the blueprint collection grows.

3. **Cached search per prompt ID** — `prepare()` runs on every model call, including after each tool response within a single user turn. Re-embedding the same user message each time would be wasteful. Caching results by prompt ID avoids redundant embedding API calls while ensuring a fresh search when the user sends a new message.

4. **Single notes field over structured log** — a freeform text field gives the agent full control over how it records observations. It can maintain a chronological log, a pros/cons list, or a simple comment — whatever suits the situation. Structured log entries would add schema complexity without clear benefit, since the agent is the only consumer.

5. **Embedding title + use_case** — the `process` and `notes` fields describe *how* to do something, not *what* to match against. Embedding only the title and use case keeps the semantic vector focused on the matching criteria (when to apply this blueprint) rather than implementation details. This produces better recall.

6. **No automatic creation** — the agent must explicitly decide (or be told by the user) to create a blueprint. Automatic creation from every conversation would produce noise. The context hint "consider creating a blueprint" nudges the agent without mandating it.

7. **Freeform process field** — the process could be structured as an array of steps, but freeform text is more flexible. The agent can write numbered steps, prose, decision trees, or any format that suits the task. Structured steps would need schema migrations as formatting needs evolve.

8. **Distance threshold default of 0.7** — cosine distance ranges from 0 (identical) to 2 (opposite). A threshold of 0.7 is permissive enough to surface loosely related blueprints while filtering out noise. This can be tuned via configuration. Starting permissive is better — the agent can ignore irrelevant suggestions, but it can't recall blueprints that were filtered out.
