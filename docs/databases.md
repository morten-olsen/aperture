# Databases

The `@morten-olsen/agentic-database` package provides type-safe SQLite access through [Kysely](https://kysely.dev/) with a migration system. Each plugin can define its own database with independent migrations while sharing the same underlying SQLite instance.

## Defining a Database

Use `createDatabase()` to define a database with its schema and migrations:

```typescript
import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'notes',
  schema: {
    notes_entries: z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
      created_at: z.string(),
    }),
    notes_tags: z.object({
      id: z.string(),
      entry_id: z.string(),
      tag: z.string(),
    }),
  },
  migrations: {
    '2026-01-01-init': {
      up: async (db) => {
        await db.schema
          .createTable('notes_entries')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('title', 'varchar(255)')
          .addColumn('content', 'text')
          .addColumn('created_at', 'datetime')
          .execute();

        await db.schema
          .createTable('notes_tags')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('entry_id', 'varchar(255)')
          .addColumn('tag', 'varchar(255)')
          .execute();
      },
    },
  },
});

export { database };
```

### Database Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier. Used to scope the migration tracking table. |
| `schema` | `Record<string, ZodType>` | Maps table names to Zod schemas describing the row shape. Provides type safety for queries. |
| `migrations` | `Record<string, Migration>` | Kysely migration objects keyed by name. Applied in alphabetical order. |

### Schema

The `schema` field maps table names to Zod schemas. Each schema describes the shape of a row in that table. This is used purely for TypeScript type inference - the actual table structure is defined by migrations.

```typescript
schema: {
  my_table: z.object({
    id: z.string(),
    name: z.string(),
    count: z.number(),
  }),
},
```

When you call `databaseService.get(database)`, the returned Kysely instance is typed based on these schemas, giving you full autocomplete and type checking on queries.

### Migrations

Migrations use [Kysely's migration system](https://kysely.dev/docs/migrations). Each migration has a unique name (used as a key) and an `up` function:

```typescript
migrations: {
  '2026-01-15-init': {
    up: async (db) => {
      await db.schema
        .createTable('triggers_triggers')
        .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
        .addColumn('title', 'varchar(255)')
        .addColumn('goal', 'text')
        .addColumn('once', 'datetime')
        .addColumn('cron', 'text')
        .execute();
    },
  },
  '2026-02-01-add-behaviour': {
    up: async (db) => {
      await db.schema
        .alterTable('triggers_triggers')
        .addColumn('behaviour_id', 'varchar(255)')
        .execute();
    },
  },
},
```

Migrations are applied in order by key name. Use a date prefix to ensure correct ordering.

Each database definition gets its own migration tracking table (`_migrations_{database.id}`), so multiple databases can coexist without conflicts.

## Using a Database

### Through `DatabaseService`

Access the database via the `DatabaseService` in the DI container:

```typescript
import { DatabaseService } from '@morten-olsen/agentic-database';

// In a service
class NoteService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  public search = async (query: string) => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);

    // Fully typed queries - Kysely knows about your tables and columns
    return db
      .selectFrom('notes_entries')
      .where('title', 'like', `%${query}%`)
      .selectAll()
      .execute();
  };
}
```

### In Plugin `setup()`

Initialize and verify data during plugin registration:

```typescript
const myPlugin = createPlugin({
  id: 'notes',
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    const db = await databaseService.get(database);

    // Migrations run automatically on first access
    // You can now query the database
    const count = await db
      .selectFrom('notes_entries')
      .select(db.fn.countAll().as('count'))
      .executeTakeFirst();
  },
});
```

### In Tools

Access databases from tool invoke functions:

```typescript
const createNoteTool = createTool({
  id: 'notes.create',
  description: 'Create a new note',
  input: z.object({
    title: z.string(),
    content: z.string(),
  }),
  output: z.object({
    id: z.string(),
  }),
  invoke: async ({ input, services }) => {
    const databaseService = services.get(DatabaseService);
    const db = await databaseService.get(database);

    const id = randomUUID();
    await db.insertInto('notes_entries').values({
      id,
      title: input.title,
      content: input.content,
      created_at: new Date().toISOString(),
    }).execute();

    return { id };
  },
});
```

## How It Works Internally

1. **Shared SQLite instance** - All databases share a single in-memory SQLite connection managed by `DatabaseService`.

2. **Lazy initialization** - The SQLite connection is created on first `get()` call.

3. **Automatic migrations** - When you call `databaseService.get(database)` for a database definition, migrations are automatically run before returning the Kysely instance. Subsequent calls skip migrations.

4. **Scoped migration tracking** - Each database ID gets its own migration table (`_migrations_{id}`), preventing conflicts between plugins.

5. **Type inference** - The returned `Kysely` instance is typed as:
   ```typescript
   Kysely<{
     [TableName in keyof Schema]: z.infer<Schema[TableName]>
   }>
   ```
   This gives you full type safety on all queries.

## Table Naming Convention

Since all databases share the same SQLite instance, prefix table names with your database/plugin ID to avoid collisions:

```typescript
// Good - prefixed with plugin/database ID
schema: {
  triggers_triggers: z.object({ ... }),
  triggers_logs: z.object({ ... }),
},

// Bad - generic names that could collide
schema: {
  entries: z.object({ ... }),
  logs: z.object({ ... }),
},
```

## File Organization

Place the database definition in a `database/` directory within your plugin:

```
my-plugin/
└── src/
    ├── database/
    │   └── database.ts         Database definition with schema and migrations
    ├── plugin/
    │   └── plugin.ts           Plugin that uses the database
    ├── service/
    │   └── service.ts          Service layer for database operations
    ├── tools/
    │   └── ...                 Tools that interact via the service
    └── exports.ts
```

Keep database access behind a service layer rather than querying directly from tools. This centralizes data access logic and makes testing easier.
