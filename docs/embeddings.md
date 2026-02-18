# Embeddings & Vector Search

The `@morten-olsen/agentic-database` package includes embedding generation and vector search utilities built on [sqlite-vec](https://github.com/asg017/sqlite-vec). Plugins can use these to add semantic search, deduplication, and context retrieval with minimal boilerplate.

## Overview

The embedding system has three parts:

1. **`EmbeddingService`** — generates vector embeddings via a configurable provider (OpenAI-compatible API or local HuggingFace models)
2. **Vector helpers** (`serializeVector`, `deserializeVector`, `vectorDistance`) — utilities for storing and querying vectors in SQLite
3. **sqlite-vec extension** — loaded automatically into the shared SQLite instance, providing `vec_distance_cosine()` and `vec_distance_L2()` SQL functions

## Configuration

Embeddings are configured through the `embeddings` option on `createDatabasePlugin()`:

```typescript
createDatabasePlugin({
  location: './db.sqlite',
  embeddings: {
    provider: 'openai',               // 'openai' or 'local'
    model: 'text-embedding-3-small',   // model ID
    dimensions: 1536,                  // vector dimensions
  },
});
```

If `embeddings` is omitted, the `EmbeddingConfig` defaults apply (`openai` provider, `text-embedding-3-small`, 1536 dimensions). You can still use `EmbeddingService` — it will use these defaults.

### Server Environment Variables

When using the server package, these environment variables configure embeddings:

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDINGS_PROVIDER` | `openai` | `openai` for hosted API, `local` for HuggingFace |
| `EMBEDDINGS_MODEL` | `openai/text-embedding-3-small` | Model identifier |
| `EMBEDDINGS_DIMENSIONS` | `1536` | Vector dimensions (must match the model's output) |

The `openai` provider reuses the same `OPENAI_API_KEY` and `OPENAI_BASE_URL` as the prompt system, so it works with OpenRouter and other OpenAI-compatible endpoints.

### Providers

**OpenAI (`'openai'`)** — Uses the OpenAI embeddings API. Works with any OpenAI-compatible endpoint (OpenRouter, Azure, etc.). The provider creates its own client using the shared `apiKey` and `baseUrl` from the services config.

**Local (`'local'`)** — Uses `@huggingface/transformers` to run a model locally. The pipeline is cached after first use. Good for development or offline use, but slower than hosted providers.

## Adding Embeddings to a Plugin

### Step 1: Define the Database with an Embedding Column

Store embeddings as `blob` columns. Use the standard `createDatabase()` pattern:

```typescript
import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const notesDatabase = createDatabase({
  id: 'notes',
  schema: {
    notes_notes: z.object({
      id: z.string(),
      content: z.string(),
      embedding: z.instanceof(Buffer),
    }),
  },
  migrations: {
    '2026-02-18-init': {
      up: async (db) => {
        await db.schema
          .createTable('notes_notes')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('content', 'text')
          .addColumn('embedding', 'blob')
          .execute();
      },
    },
  },
});
```

### Step 2: Generate and Store Embeddings

Use `EmbeddingService.embed()` to generate vectors, and `serializeVector()` to convert them for storage:

```typescript
import { DatabaseService, EmbeddingService, serializeVector } from '@morten-olsen/agentic-database';
import type { Services } from '@morten-olsen/agentic-core';

class NoteService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  public create = async (id: string, content: string) => {
    const dbService = this.#services.get(DatabaseService);
    const db = await dbService.get(notesDatabase);
    const embeddingService = this.#services.get(EmbeddingService);

    const [vector] = await embeddingService.embed([content]);
    await db
      .insertInto('notes_notes')
      .values({
        id,
        content,
        embedding: serializeVector(vector),
      })
      .execute();
  };
}
```

`EmbeddingService.embed()` accepts an array of strings and returns an array of `number[]` vectors in the same order. Batch multiple texts in a single call for efficiency.

### Step 3: Similarity Search

Use `vectorDistance()` to create a Kysely SQL fragment for distance calculations. It works in `.select()`, `.orderBy()`, and `.where()`:

```typescript
import { vectorDistance } from '@morten-olsen/agentic-database';

public search = async (query: string, limit = 10) => {
  const dbService = this.#services.get(DatabaseService);
  const db = await dbService.get(notesDatabase);
  const embeddingService = this.#services.get(EmbeddingService);

  const [queryVector] = await embeddingService.embed([query]);
  return db
    .selectFrom('notes_notes')
    .select(['id', 'content'])
    .select(vectorDistance('embedding', queryVector).as('distance'))
    .orderBy('distance')
    .limit(limit)
    .execute();
};
```

Results are ordered by ascending distance (closest match first). Each row includes a `distance` field you can use for thresholding.

## API Reference

### `EmbeddingService`

DI service accessed via `services.get(EmbeddingService)`.

| Member | Type | Description |
|--------|------|-------------|
| `embed(texts)` | `(texts: string[]) => Promise<number[][]>` | Batch-embed strings into vectors. Returns vectors in input order. |
| `dimensions` | `number` (getter) | The configured vector dimensions. Useful for validation or migration logic. |

### `EmbeddingConfig`

Mutable config service (same pattern as `DatabaseConfig`). Set during plugin `setup()`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `provider` | `'openai' \| 'local'` | `'openai'` | Which embedding provider to use |
| `model` | `string` | `'text-embedding-3-small'` | Model identifier |
| `dimensions` | `number` | `1536` | Vector dimensions |

### Vector Helpers

Standalone functions exported from `@morten-olsen/agentic-database`:

#### `serializeVector(vector: number[]): Buffer`

Converts a number array to a `Float32Array` buffer for storage as a SQLite BLOB. This is the format sqlite-vec expects.

#### `deserializeVector(buffer: Buffer): number[]`

Converts a BLOB back to a number array. Use when you need to read raw vectors from query results.

#### `vectorDistance(column: string, vector: number[], metric?: 'cosine' | 'l2'): RawBuilder<number>`

Creates a Kysely `sql` fragment that calls the sqlite-vec distance function. Returns a `RawBuilder<number>` usable in `.select()`, `.orderBy()`, and `.where()`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `column` | `string` | — | The table column containing the embedding BLOB |
| `vector` | `number[]` | — | The query vector to compare against |
| `metric` | `'cosine' \| 'l2'` | `'cosine'` | Distance metric. Cosine is best for most text similarity tasks. |

## Testing Plugins with Embeddings

In tests, use `services.set()` to replace `EmbeddingService` with a mock:

```typescript
import { Services } from '@morten-olsen/agentic-core';
import { DatabaseService, EmbeddingService } from '@morten-olsen/agentic-database';

const services = Services.mock();

// Mock the embedding service to return deterministic vectors
services.set(EmbeddingService, {
  dimensions: 3,
  embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
});

const dbService = services.get(DatabaseService);
await dbService.get(myDatabase);

// Now test your service/tool that uses embeddings
```

This avoids real API calls and makes tests fast and deterministic.

## How It Works Internally

1. **sqlite-vec loading** — When `DatabaseService` creates the SQLite connection, it calls `sqliteVec.load(db)` to register the vector distance functions as SQL extensions.

2. **Lazy provider creation** — `EmbeddingService` creates the actual provider (OpenAI client or HuggingFace pipeline) on the first `embed()` call, not at construction time.

3. **Vector storage** — Vectors are stored as raw `Float32Array` buffers (BLOBs). sqlite-vec reads these directly without any parsing overhead.

4. **Distance computation** — `vectorDistance()` generates SQL like `vec_distance_cosine(embedding, X'...')` where the query vector is inlined as a BLOB literal. sqlite-vec computes the distance in native code.
