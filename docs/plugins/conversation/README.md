# Conversation Plugin

The conversation plugin manages multi-turn conversation history and state. It tracks conversations per user, persists prompt history to the database, and rehydrates conversations on cold start. It also integrates with the notification system to inject published notifications into active conversations.

## Registration

```typescript
import { conversationPlugin } from '@morten-olsen/agentic-conversation';

await pluginService.register(conversationPlugin);
```

No configuration options — the plugin registers itself with a fixed ID of `'conversation'`.

## Core Concepts

### ConversationService

The primary API for managing conversations. Available via the DI container:

```typescript
const conversationService = services.get(ConversationService);
```

**Key methods:**

| Method | Description |
|--------|-------------|
| `create(input)` | Create a new conversation for a user |
| `get(id, userId)` | Get or rehydrate a conversation (cached) |
| `getActive(userId)` | Get the user's active conversation |
| `setActive(conversationId, userId)` | Set or clear the active conversation |
| `insertIntoActive(prompt)` | Insert a prompt into the user's active conversation |

Conversations are cached in an LRU cache (max 50 entries) keyed by conversation ID. Cache eviction uses last-access timestamps.

### ConversationInstance

Returned by `ConversationService.get()` and `.create()`. Represents a single conversation with its full prompt history.

```typescript
const conversation = await conversationService.get('conv-1', 'user-1');

const prompt = await conversation.prompt({
  input: 'What meetings do I have today?',
  model: 'normal',
  state: { /* optional plugin state overrides */ },
});
```

Each call to `prompt()`:
1. Ensures the user and conversation exist in the database
2. Creates a `PromptCompletion` with the full conversation history
3. Links the prompt to the conversation in the database
4. On completion, persists updated plugin state

### Rehydration

When a conversation is loaded from the database (cache miss), the service:
1. Fetches the conversation record and its prompt IDs
2. Loads prompts from `PromptStoreService` (database package)
3. Parses the stored state JSON
4. Reconstructs a `ConversationInstance` with full history

## Notification Integration

During setup, the plugin listens for `NotificationService` published events. When a notification fires, it's automatically inserted as a completed prompt into the target user's active conversation:

```typescript
notificationService.on('published', async (notification) => {
  conversationService.insertIntoActive({
    id: randomUUID(),
    userId: notification.userId,
    model: 'normal',
    state: 'completed',
    output: [{ type: 'text', content: notification.body, start: new Date().toISOString() }],
  });
});
```

This means notifications appear naturally in the conversation history for the next prompt.

## Database

Database ID: `conversation`. Three tables:

**`conversation_users`** — per-user metadata (PK: `id`)

Columns: `id`, `active_conversation_id` (nullable), `created_at`

**`conversation_conversations`** — conversation records (PK: `id`)

Columns: `id`, `user_id`, `state` (JSON string, nullable), `created_at`, `updated_at`

**`conversation_prompts`** — maps conversations to prompts

Columns: `conversation_id`, `prompt_id`. Ordered by `rowid ASC`.

## API-Only Tools

The conversation plugin exports a set of tools designed for **REST clients only** — they are not injected into the agent's tool list during `prepare()`. The agent operates within a conversation, not across them, so it has no need to create or list conversations.

These tools are exported as `conversationApiTools` and wired to the API by the server package:

```typescript
import { conversationApiTools } from '@morten-olsen/agentic-conversation';

apiService.exposeTools(conversationApiTools, { tag: 'Conversations' });
```

### `conversation.create`

Creates a new conversation for the current user.

- **Input**: `{}` (userId comes from the `X-User-Id` header)
- **Output**: `{ id: string }`

### `conversation.list`

Lists conversations for the current user, ordered by most recently updated.

- **Input**: `{ limit?: number, offset?: number }`
- **Output**: `{ conversations: [{ id, createdAt, updatedAt }] }`

### `conversation.get`

Retrieves a conversation with its full prompt history. Useful for rehydrating a chat UI on reconnection.

- **Input**: `{ conversationId: string }`
- **Output**: `{ id, createdAt, updatedAt, prompts: Prompt[] }`

### `conversation.delete`

Deletes a conversation and its prompt associations. The prompts themselves are retained in the prompt store.

- **Input**: `{ conversationId: string }`
- **Output**: `{ deleted: boolean }`

## Dependencies

- `@morten-olsen/agentic-core` — plugin creation, `PromptService`
- `@morten-olsen/agentic-database` — `DatabaseService`, `PromptStoreService`
- `@morten-olsen/agentic-notification` — `NotificationService` for auto-injection
