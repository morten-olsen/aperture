# Database Package

The database package provides type-safe SQLite access with per-plugin migration tracking. It's a foundation-layer package — plugins define their own databases with `createDatabase()`, and all share a single underlying SQLite instance managed by `DatabaseService`.

## Registration

```typescript
import { createDatabasePlugin } from '@morten-olsen/agentic-database';

const plugin = createDatabasePlugin({
  location: '/data/agent.db',  // or ':memory:' for in-memory
});
await pluginService.register(plugin);
```

During setup, the plugin:
1. Sets the database file location on `DatabaseConfig`
2. Initializes the `PromptStoreService` (built-in prompt persistence)
3. Calls `promptStoreService.listen()` to auto-capture prompts

## Defining a Database

Use `createDatabase()` to define a typed database with schema and migrations:

```typescript
import { createDatabase } from '@morten-olsen/agentic-database';

const myDatabase = createDatabase({
  id: 'myplugin',
  schema: {
    myplugin_items: z.object({
      id: z.string(),
      name: z.string(),
      created_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('myplugin_items')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('name', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});
```

**Conventions:**
- Prefix table names with the database ID (e.g., `myplugin_items`) to avoid collisions
- Migration keys are sorted alphabetically — use date prefixes for ordering
- Zod schemas drive TypeScript types for full query autocomplete

## Using a Database

Get a typed Kysely instance from `DatabaseService`:

```typescript
const databaseService = services.get(DatabaseService);
const db = await databaseService.get(myDatabase);

// Fully typed queries
const items = await db.selectFrom('myplugin_items').selectAll().execute();
await db.insertInto('myplugin_items').values({ id, name, created_at }).execute();
```

The first call to `.get()` for a database:
1. Creates the shared SQLite connection (if not yet initialized)
2. Runs pending migrations for that database
3. Caches the instance for subsequent calls

## Migration System

Each database gets its own migration tracking table: `_migrations_{database.id}`. This prevents conflicts when multiple plugins share one SQLite instance.

Migrations use Kysely's `Migrator`:

```typescript
const migrator = new Migrator({
  db,
  provider: { getMigrations: async () => database.migrations },
  migrationTableName: `_migrations_${database.id}`,
});
await migrator.migrateToLatest();
```

Only `up` migrations are needed — rollback isn't required for in-memory databases.

**Naming matters:** migration keys sort alphabetically, so `2026-02-15-add-model` runs before `2026-02-15-init` because `a` < `i`. Name carefully.

## DatabaseConfig

Controls the SQLite file location:

```typescript
const config = services.get(DatabaseConfig);
config.location = '/data/agent.db';  // file-based
config.location = ':memory:';        // in-memory (default)
```

Must be set before any `DatabaseService.get()` call.

## PromptStoreService

Built-in service for persisting conversation prompts. Automatically captures prompts via event listeners on `PromptService`:

```typescript
const promptStore = services.get(PromptStoreService);
promptStore.listen();  // Called automatically by the database plugin

// Manual queries
const prompt = await promptStore.getById('prompt-123');
const prompts = await promptStore.getByIds(['p1', 'p2']);  // preserves order
const results = await promptStore.search({
  before: '2026-02-17T00:00:00Z',
  after: '2026-02-01T00:00:00Z',
  limit: 50,
  offset: 0,
});
```

**Prompt table** (`db_prompts`): `id`, `model`, `userId`, `visible`, `state`, `input`, `output` (JSON), `created_at`, `completed_at`

## Dependencies

- `@morten-olsen/agentic-core` — Services DI container, `PromptService` events
- `better-sqlite3` — native SQLite driver
- `kysely` — type-safe query builder with migrations
- `zod` — runtime schema validation
