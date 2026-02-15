# 003: Prompt & Conversation Persistence

**Status**: Draft

## Overview

Add database persistence for prompts and conversations. A `databasePlugin` in `packages/database/` automatically captures every prompt via a `PromptStoreService` that listens to `PromptService` events — prompts are saved immediately on creation (state `'running'`) and updated on completion. A `conversationPlugin` in `packages/conversation/` persists conversations (including plugin state) and their prompt-to-conversation mappings so conversations can be loaded from the database.

Together these enable: durable prompt history, in-flight prompt tracking, searchable prompt store accessible to other plugins, and conversation continuity across restarts.

## Scope

- `databasePlugin` in `packages/database/` — registers event listeners, provides prompt storage infrastructure
- `PromptStoreService` in `packages/database/` — stores prompts on creation and updates on completion, provides search/retrieval API
- `conversationPlugin` in `packages/conversation/` — persists conversations (including plugin state), manages the conversation-prompt relation
- `ConversationService` gains database-backed `get()` — loads conversations from the database with full prompt history

## Out of Scope (for now)

- Full-text search (SQLite FTS, text content search)
- Conversation deletion / archival
- Prompt deduplication (each run creates new rows)
- AI-facing tools — `PromptStoreService` is a service-level API only, not exposed as agent tools

## Architecture

```
PromptService.emit('created', completion)
      ↓
PromptStoreService.on('created')
      ↓ inserts prompt row immediately (state: 'running')
      ↓ subscribes to completion.on('completed')
      ↓
Updates prompt row on completion (state, output, completed_at)
      ↓
Other plugins call PromptStoreService.getByIds() / .search()


ConversationInstance.prompt()
      ↓ creates PromptCompletion
      ↓ records mapping
      ↓
Saves row to `conversation_prompts` relation table
      ↓
ConversationService.get(id) hydrates from database
```

### Package Dependencies (changes)

- `packages/database/` gains a dependency on `@morten-olsen/agentic-core` (for `PromptService`, `createPlugin`)
- `packages/conversation/` gains a dependency on `@morten-olsen/agentic-database` (for `DatabaseService`, `PromptStoreService`)

This changes `database` from a foundation package with no internal deps to one that depends on `core`. This is acceptable because the `DatabaseService` and `createDatabase` remain independent — only the new `databasePlugin` and `PromptStoreService` depend on core.

## Data Model

### `db_prompts` table (owned by `databasePlugin`)

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Prompt UUID (from `prompt.id`) |
| model | TEXT NOT NULL | Model ID used |
| visible | INTEGER NOT NULL | Boolean (0/1), default 1 |
| state | TEXT NOT NULL | `'running'` or `'completed'` |
| input | TEXT | User input message (nullable) |
| output | TEXT NOT NULL | JSON-serialized `PromptOutput[]` |
| created_at | TEXT NOT NULL | ISO8601 timestamp |
| completed_at | TEXT | ISO8601 timestamp (nullable, set on completion) |

### `conversation_conversations` table (owned by `conversationPlugin`)

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Conversation UUID |
| user_id | TEXT NOT NULL | Owner user ID (hardcoded to `'admin'` for now) |
| state | TEXT | JSON-serialized `Record<string, unknown>` (plugin state, nullable) |
| created_at | TEXT NOT NULL | ISO8601 timestamp |
| updated_at | TEXT NOT NULL | ISO8601 timestamp |

### `conversation_prompts` relation table (owned by `conversationPlugin`)

| Column | Type | Description |
|--------|------|-------------|
| conversation_id | TEXT NOT NULL | FK to `conversation_conversations.id` |
| prompt_id | TEXT NOT NULL | FK to `db_prompts.id` |
| PK | | `(conversation_id, prompt_id)` |

Order is determined by joining on `db_prompts.created_at` — no separate position column needed since prompts are always appended sequentially.

### `conversation_users` table (owned by `conversationPlugin`)

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | User ID (`'admin'` for now) |
| active_conversation_id | TEXT | FK to `conversation_conversations.id` (nullable — no active conversation) |
| created_at | TEXT NOT NULL | ISO8601 timestamp |

## Components

### PromptStoreService (`packages/database/src/prompt-store/`)

Service registered in the DI container. Stores and retrieves prompts from the database.

```
class PromptStoreService {
  constructor(services: Services)

  // Called by databasePlugin.setup() to wire up event listeners
  listen(): void

  // Retrieval
  getById(id: string): Promise<Prompt | undefined>
  getByIds(ids: string[]): Promise<Prompt[]>

  // Search (by IDs and time constraints only — no text search)
  search(query: PromptSearchQuery): Promise<PromptSearchResult>
}
```

**Search Query**:
```typescript
type PromptSearchQuery = {
  ids?: string[];              // Filter to specific prompt IDs
  before?: string;             // ISO8601 — created before
  after?: string;              // ISO8601 — created after
  limit?: number;              // Default 50
  offset?: number;             // For pagination
};

type PromptSearchResult = {
  prompts: Prompt[];
  total: number;
};
```

**Event Wiring** (`listen()`):
1. Get `PromptService` from the DI container
2. Subscribe to `PromptService.on('created', (completion) => { ... })`
3. On creation, insert prompt row immediately with state `'running'` and empty output `[]`
4. Subscribe to `completion.on('completed', () => { ... })`
5. On completion, update the row with final state, serialized output, and `completed_at`

**Row ↔ Domain Conversion**:
- `output` column stores `JSON.stringify(prompt.output)`, parsed back with `JSON.parse()` on read
- `visible` column stores `0`/`1`, converted to boolean on read

### databasePlugin (`packages/database/src/plugin/`)

```typescript
const databasePlugin = createPlugin({
  id: 'database',
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(promptStoreDatabase);

    const promptStore = services.get(PromptStoreService);
    promptStore.listen();
  },
});
```

No `prepare()` — this plugin is pure infrastructure. It does not contribute tools, context, or state to prompts. Other plugins access `PromptStoreService` directly via the DI container.

### ConversationRepo (`packages/conversation/src/repo/`)

Data access layer for conversation persistence.

```
class ConversationRepo {
  constructor(services: Services)

  // Conversations
  upsert(id: string, userId: string, state?: Record<string, unknown>): Promise<void>
  get(id: string): Promise<{ id: string; userId: string; state?: Record<string, unknown>; createdAt: string; updatedAt: string } | undefined>
  list(userId: string): Promise<Array<{ id: string; createdAt: string; updatedAt: string }>>
  updateState(id: string, state: Record<string, unknown>): Promise<void>

  // Prompt mappings
  addPrompt(conversationId: string, promptId: string): Promise<void>
  getPromptIds(conversationId: string): Promise<string[]>  // ordered by db_prompts.created_at

  // Users (active conversation tracking)
  getUser(userId: string): Promise<{ id: string; activeConversationId: string | null } | undefined>
  setActiveConversation(userId: string, conversationId: string | null): Promise<void>
  ensureUser(userId: string): Promise<void>
}
```

**User auto-creation**: When a conversation is upserted, `ensureUser()` is called for the conversation's `userId`. If the user row doesn't exist, it's inserted with `active_conversation_id = null`. This guarantees the user exists before any foreign key or active conversation reference is needed.

**Hardcoded user ID**: Until multi-user support is introduced, all conversations use `userId = 'admin'`. This is passed through from `ConversationService` which defaults to `'admin'` everywhere a user ID is needed.

### conversationPlugin (`packages/conversation/src/plugin/`)

```typescript
const conversationPlugin = createPlugin({
  id: 'conversation',
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(conversationDatabase);
  },
});
```

No `prepare()` needed — conversations are an infrastructure concern, not contributing tools to prompts.

### ConversationService Changes

`ConversationService.get(id)` becomes database-aware. New methods for active conversation tracking. The in-memory cache uses an access-time-based eviction strategy with a configurable max size.

```
Current behavior:
  get(id) → creates empty in-memory ConversationInstance if not cached
  #conversations is an unbounded Record<string, ConversationInstance>

New behavior:
  get(id) → if cached, touch (update last-access time) and return
           → if not cached, check database:
             → if found, load conversation row (including state + userId)
             → load prompt IDs from conversation_prompts (ordered by db_prompts.created_at)
             → fetch full prompts from PromptStoreService.getByIds()
             → create ConversationInstance with hydrated history + state
             → add to cache (may evict oldest entry), return
           → if not in database either, create new, add to cache, return

Cache eviction:
  → Tracks last-access timestamp per entry (updated on every get/create/prompt)
  → When cache exceeds maxCacheSize, evicts the least-recently-accessed entry
  → Eviction is safe because all state is persisted — evicted conversations
    are simply reloaded from the database on next access
  → Default maxCacheSize: 50

New methods:
  getActive(userId?: string)
    → userId defaults to 'admin'
    → looks up conversation_users.active_conversation_id
    → if set, delegates to get(activeId)
    → if null/no user row, returns undefined

  setActive(conversationId: string | null, userId?: string)
    → userId defaults to 'admin'
    → ensures user row exists
    → updates conversation_users.active_conversation_id
```

All methods that accept a `userId` parameter default to `'admin'`. This is the single place the hardcoded user ID lives — when multi-user support is added, callers will pass explicit user IDs instead.

**Cache implementation**: A simple `Map<string, { instance: ConversationInstance; lastAccess: number }>`. On insertion when at capacity, iterate to find the entry with the lowest `lastAccess` and delete it. No external dependency needed — the access pattern (infrequent lookups, small N) doesn't warrant a full LRU linked-list.

### ConversationInstance Changes

`ConversationInstance.prompt()` gains persistence:

```
Current behavior:
  prompt(input) → create PromptCompletion
               → push prompt to in-memory array
               → return completion

New behavior:
  prompt(input) → upsert conversation to database (with userId + current state)
               → ensure user row exists (auto-creates if missing)
               → create PromptCompletion
               → push prompt to in-memory array
               → save conversation_prompts relation row
               → subscribe to completion.on('completed') to persist updated state
               → return completion
```

The relation row is saved immediately (before `completion.run()`) so the mapping exists even if the prompt is still running. The prompt's actual data is saved by the `PromptStoreService` on creation. On completion, the conversation's state is updated in the database (to capture any state changes made by plugins during the agent loop).

`ConversationInstance` gains a `userId` property (passed via `ConversationInstanceOptions`). Defaults to `'admin'`.

## Database Definitions

### Prompt Store Database (`packages/database/src/prompt-store/prompt-store.database.ts`)

```typescript
const promptStoreDatabase = createDatabase({
  id: 'prompt-store',
  schema: {
    db_prompts: z.object({
      id: z.string(),
      model: z.string(),
      visible: z.number(),
      state: z.string(),
      input: z.string().nullable(),
      output: z.string(),
      created_at: z.string(),
      completed_at: z.string().nullable(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('db_prompts')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('model', 'text', (col) => col.notNull())
          .addColumn('visible', 'integer', (col) => col.notNull().defaultTo(1))
          .addColumn('state', 'text', (col) => col.notNull())
          .addColumn('input', 'text')
          .addColumn('output', 'text', (col) => col.notNull())
          .addColumn('created_at', 'text', (col) => col.notNull())
          .addColumn('completed_at', 'text')
          .execute();
      },
    },
  },
});
```

### Conversation Database (`packages/conversation/src/database/database.ts`)

```typescript
const conversationDatabase = createDatabase({
  id: 'conversations',
  schema: {
    conversation_conversations: z.object({
      id: z.string(),
      user_id: z.string(),
      state: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
    conversation_prompts: z.object({
      conversation_id: z.string(),
      prompt_id: z.string(),
    }),
    conversation_users: z.object({
      id: z.string(),
      active_conversation_id: z.string().nullable(),
      created_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('conversation_users')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('active_conversation_id', 'text')
          .addColumn('created_at', 'text', (col) => col.notNull())
          .execute();

        await db.schema
          .createTable('conversation_conversations')
          .addColumn('id', 'text', (col) => col.primaryKey())
          .addColumn('user_id', 'text', (col) => col.notNull())
          .addColumn('state', 'text')
          .addColumn('created_at', 'text', (col) => col.notNull())
          .addColumn('updated_at', 'text', (col) => col.notNull())
          .execute();

        await db.schema
          .createTable('conversation_prompts')
          .addColumn('conversation_id', 'text', (col) => col.notNull())
          .addColumn('prompt_id', 'text', (col) => col.notNull())
          .execute();
      },
    },
  },
});
```

## File Structure

### packages/database/ (additions)

```
packages/database/src/
├── database/                          # Existing
│   ├── database.ts
│   ├── database.service.ts
│   └── database.types.ts
├── prompt-store/                      # New
│   ├── prompt-store.ts                # Barrel: re-exports service + database
│   ├── prompt-store.database.ts       # Database definition + migrations
│   └── prompt-store.service.ts        # PromptStoreService
├── plugin/                            # New
│   └── plugin.ts                      # databasePlugin definition
└── exports.ts                         # Updated: adds prompt-store + plugin exports
```

### packages/conversation/ (additions)

```
packages/conversation/src/
├── service/                           # Existing (modified)
│   ├── service.ts                     # ConversationService — gains DB loading
│   ├── service.instance.ts            # ConversationInstance — gains DB persistence
│   └── service.schemas.ts
├── database/                          # New
│   └── database.ts                    # Database definition + migrations
├── repo/                              # New
│   └── repo.ts                        # ConversationRepo
├── plugin/                            # New
│   └── plugin.ts                      # conversationPlugin definition
└── exports.ts                         # Updated: adds repo + plugin exports
```

## Prompt Lifecycle & Persistence Flow

```
1. ConversationInstance.prompt(input)
   → Ensures user row exists (conversation_users, auto-creates for userId)
   → Upserts conversation row with userId + current state (conversation_conversations)
   → Calls PromptService.create(options)
      → PromptService emits 'created' with PromptCompletion
      → PromptStoreService hears 'created':
        - Inserts prompt row immediately (state: 'running', output: '[]')
        - Subscribes to completion.on('completed')
   → Pushes prompt to in-memory array
   → Inserts relation row (conversation_prompts)
   → Subscribes to completion.on('completed') to persist updated conversation state
   → Returns PromptCompletion

2. caller awaits completion.run()
   → Agent loop executes (prepare → model → tools → loop)
   → On completion, PromptCompletion emits 'completed'
   → PromptStoreService hears 'completed', updates db_prompts row (state, output, completed_at)
   → ConversationInstance hears 'completed', updates conversation state in database

3. Later: ConversationService.get(id)
   → Loads conversation from conversation_conversations (including state)
   → Loads prompt IDs from conversation_prompts (ordered by db_prompts.created_at)
   → Loads full prompts from db_prompts via PromptStoreService.getByIds()
   → Hydrates ConversationInstance with history + state
```

## Edge Cases

- **Prompt created outside a conversation**: The `PromptStoreService` captures ALL prompts (it listens to `PromptService`), even ones not attached to any conversation. The `conversation_prompts` relation simply won't have a row for those.
- **Conversation loaded while a prompt is running**: Both the `conversation_prompts` relation row and the `db_prompts` row exist (prompt is saved on creation with state `'running'`). The prompt's output will be empty `[]` until completion updates it. The in-memory `ConversationInstance` will have the live prompt object with real-time output.
- **Duplicate `get()` calls**: The in-memory cache in `ConversationService` prevents duplicate database loads. Cached entries are kept until evicted (least-recently-accessed, max 50 entries). Evicted conversations are transparently reloaded from the database on next access.
- **Eviction of active conversations**: Not special-cased. If a conversation is actively being used, its `lastAccess` timestamp is recent, so it won't be evicted. If it is evicted (e.g., 50+ other conversations were accessed since), it's reloaded from the database with full state — no data loss.

## Resolved Questions

1. **In-flight prompt tracking**: Yes — prompts are saved on creation (state `'running'`, empty output) and updated on completion. This allows tracking in-flight prompts and recovering from crashes.
2. **Conversation state persistence**: Yes — `conversation_conversations.state` stores JSON-serialized plugin state. Updated on prompt completion so the latest state is always persisted.
3. **AI-facing tools**: No — `PromptStoreService` is a service-level API only. No tools are exposed to the AI agent. Other plugins access the service directly via the DI container.
4. **Search capabilities**: By IDs (array) and time constraints only. No text/content search.
5. **User model**: A `conversation_users` table tracks the active conversation per user. Users are auto-created when a conversation is first saved for that user ID. All user IDs hardcoded to `'admin'` until multi-user support is introduced — the default lives in `ConversationService` method signatures.
