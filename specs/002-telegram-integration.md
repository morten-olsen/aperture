# 002: Telegram Integration

**Status**: Draft

## Overview

The `@morten-olsen/agentic-telegram` package provides a Telegram bot integration on top of the conversation plugin. It bridges Telegram chats to the agentic framework: incoming messages become conversation prompts, and the agent's responses are sent back as Telegram messages.

The primary goal is a **hands-free Telegram bot** — users message the bot, and the agent responds using whatever plugins are registered (triggers, skills, etc.). Conversations are in-memory only (via `ConversationService`), but Telegram-specific metadata is persisted in a database.

## Scope

- Telegram Bot API client via **GramIO** (long-polling, no webhooks required)
- Chat-to-conversation mapping (each Telegram chat gets a `ConversationInstance`)
- Message relay: Telegram → agent prompt → Telegram reply
- Plugin that injects Telegram context and tools into agent sessions
- Database for tracking chat metadata and mapping

## Out of Scope (for now)

- Webhook mode (long-polling is simpler for development)
- Media/file handling (text messages only)
- Group chat moderation tools
- Conversation persistence (conversations are in-memory only)

## Architecture

```
Telegram Bot API
      ↕ (long-polling)
TelegramBotService
      ↕
  on message → ConversationService.get(chatId)
             → conversation.prompt({ input: text, model })
             → completion.run()
             → send response back via TelegramBotService
```

### Package Dependencies

- `@morten-olsen/agentic-core` — Plugin, Services, State
- `@morten-olsen/agentic-conversation` — ConversationService
- `@morten-olsen/agentic-database` — Chat metadata persistence
- `gramio` — Telegram Bot API client (long-polling, typed API methods)

## Key Design Decision: Finding the "Latest Non-Trigger Conversation"

When the Telegram bot receives a message, it needs to route it to the right conversation. The rule is: **each Telegram chat maps to one conversation**, identified by a deterministic ID derived from the chat ID (e.g., `telegram:{chatId}`).

The trigger plugin's state is used to distinguish trigger-invoked sessions from user-facing ones. During `prepare()`, the plugin checks `state.getState(triggerPlugin)` — if `.from` is set, this is a trigger session and the Telegram plugin should not inject chat context. If `.from` is absent, this is a normal user session and the plugin provides Telegram tools and context.

## Data Model

### Chats Table (`telegram_chats`)

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Deterministic: `telegram:{chatId}` |
| telegram_chat_id | TEXT | Telegram's numeric chat ID (as string) |
| chat_type | TEXT | `'private'`, `'group'`, `'supergroup'`, `'channel'` |
| title | TEXT | Chat title (nullable, for groups) |
| username | TEXT | Username for private chats (nullable) |
| first_name | TEXT | First name for private chats (nullable) |
| model | TEXT | Model override for this chat (nullable, falls back to default) |
| created_at | TEXT | ISO8601 timestamp |
| updated_at | TEXT | ISO8601 timestamp |

No messages table — conversation history lives in-memory in `ConversationInstance`. The chats table exists to track which chats the bot has seen and to store per-chat configuration (like model override).

## Components

### TelegramBotService

The core service that manages the GramIO bot instance. Registered in the DI container.

```
class TelegramBotService {
  constructor(services: Services)

  // Lifecycle
  start(token: string, options: TelegramBotOptions): void
  stop(): void

  // Send a message to a chat (handles markdown conversion + message splitting)
  sendMessage(chatId: string, text: string): Promise<void>

  // Access the underlying GramIO bot instance
  get bot(): Bot
}
```

**Options**:
```typescript
type TelegramBotOptions = {
  defaultModel: string;          // Model to use when no per-chat override
  allowedChatIds?: string[];     // If set, only respond in these chats (allowlist)
};
```

The service wraps a GramIO `Bot` instance which handles long-polling, update parsing, and typed API calls. Message handlers are registered via `bot.on("message", ...)` during setup.

### TelegramChatRepo

Data access layer for the `telegram_chats` table.

```
class TelegramChatRepo {
  constructor(services: Services)

  upsert(chat: TelegramChat): Promise<void>
  get(id: string): Promise<TelegramChat | undefined>
  getByTelegramId(chatId: string): Promise<TelegramChat | undefined>
  list(): Promise<TelegramChat[]>
  updateModel(id: string, model: string | null): Promise<void>
}
```

### TelegramMessageHandler

Orchestrates the message flow. Not a service — instantiated by the plugin during setup.

```
on incoming message:
  1. Upsert chat metadata to database
  2. Resolve model (per-chat override ?? defaultModel)
  3. Get or create conversation: conversationService.get(`telegram:${chatId}`)
  4. Create prompt: conversation.prompt({ input: message.text, model })
  5. Run completion: await completion.run()
  6. Extract text output from completion
  7. Convert markdown to Telegram MarkdownV2, split if >4096 chars
  8. Send response chunk(s) via TelegramBotService.sendMessage()
```

### Plugin Definition

```typescript
const createTelegramPlugin = (options: TelegramPluginOptions) =>
  createPlugin({
    id: 'telegram',
    state: telegramStateSchema,
    setup,
    prepare,
  });
```

**State Schema**:
```typescript
const telegramStateSchema = z.object({
  chat: z.object({
    id: z.string(),           // telegram:{chatId}
    telegramChatId: z.string(),
    chatType: z.string(),
    title: z.string().optional(),
    username: z.string().optional(),
  }),
});
```

State is set when the message handler creates the prompt, so `prepare()` knows the Telegram context.

**Plugin Options**:
```typescript
type TelegramPluginOptions = {
  token: string;                 // Bot API token
  defaultModel: string;          // Fallback model
  allowedChatIds?: string[];     // Chat allowlist
};
```

### Setup

1. Initialize database (run migrations)
2. Create and start `TelegramBotService`
3. Wire up message handler

### Prepare

1. Read trigger state — if this is a trigger-invoked session, skip Telegram tools/context
2. Read Telegram state — if no chat context, push standard tools only
3. If chat context exists:
   - Inject context: "You are chatting with {username} via Telegram ({chatType})"
   - Push tools: `telegram.sendMessage`, `telegram.setModel`

## Tool Definitions

| Tool ID | Description | Availability |
|---------|-------------|-------------|
| telegram.sendMessage | Send an additional message to the current Telegram chat | Active chat session only |
| telegram.setModel | Change the model used for this chat | Active chat session only |
| telegram.listChats | List all known Telegram chats | Always (non-trigger sessions) |

### telegram.sendMessage

Sends a proactive message (useful when the agent wants to send multiple messages or a follow-up). The main response is sent automatically by the message handler — this tool is for extra messages.

Input: `{ text: string }`
Output: `{ messageId: number }`

### telegram.setModel

Updates the per-chat model override in the database.

Input: `{ model: string | null }` — `null` clears the override
Output: `{ success: boolean }`

### telegram.listChats

Lists all chats the bot has interacted with.

Input: `{}` (empty)
Output: `{ chats: Array<{ id, telegramChatId, chatType, title, username }> }`

## Message Flow

### Incoming Message (Happy Path)

```
1. Telegram sends update via long-polling
2. TelegramBotService emits message event
3. Message handler:
   a. Upserts chat to database
   b. Resolves model for chat
   c. Gets ConversationInstance for `telegram:{chatId}`
   d. Creates prompt with state: { telegram: { chat: { ... } } }
   e. Runs completion
   f. Extracts final text output
   g. Sends text back to Telegram via sendMessage API
```

### Trigger Integration

When a trigger fires, it does NOT have Telegram state — the plugin detects this and provides no Telegram context. If the trigger needs to notify the user, it uses the trigger's `notifyHandler`, which could be wired to send a Telegram message:

```typescript
const telegramPlugin = createTelegramPlugin({
  token: 'BOT_TOKEN',
  defaultModel: 'gpt-4o',
});

const triggerPlugin = createTriggerPlugin({
  notifyHandler: async ({ title, body }) => {
    const botService = services.get(TelegramBotService);
    await botService.sendMessage(NOTIFY_CHAT_ID, `**${title}**\n${body}`);
  },
});
```

This keeps the trigger and Telegram plugins decoupled — the trigger plugin doesn't know about Telegram.

## Concurrency

Multiple Telegram messages may arrive while the agent is still processing a previous message for the same chat. The message handler should queue messages per-chat and process them sequentially to avoid race conditions on the conversation state. Different chats can be processed concurrently.

## Error Handling

- **Bot API errors**: Log and skip. Don't crash the process.
- **Model errors**: Catch, send "Sorry, something went wrong" to the chat.
- **Invalid updates**: Skip silently (non-text messages, edits, etc.).

## Markdown Conversion

Agent responses use standard Markdown. Telegram requires **MarkdownV2** format, which has different escaping rules and a slightly different feature set. The `sendMessage` method in `TelegramBotService` handles conversion:

1. Convert standard Markdown → Telegram MarkdownV2 (bold, italic, code, code blocks, links)
2. Escape special MarkdownV2 characters in plain text segments (`_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`)
3. If conversion fails, fall back to sending as plain text

This lives in a utility function `toTelegramMarkdown(text: string): string` in `service/service.markdown.ts`.

## Message Splitting

Telegram enforces a 4096-character limit per message. Long agent responses are split before sending:

1. Prefer splitting at paragraph boundaries (`\n\n`)
2. Fall back to line boundaries (`\n`)
3. Last resort: split at the character limit

Each chunk is sent as a separate message in order. Code blocks are handled carefully — if a split falls inside a code block, the block is closed at the split point and reopened in the next chunk.

This lives in `service/service.split.ts`.

## External Dependencies

- **gramio** — Telegram Bot API client. Handles long-polling, update parsing, typed API methods.

## File Structure

```
packages/telegram/
├── src/
│   ├── plugin/
│   │   └── plugin.ts
│   ├── service/
│   │   ├── service.bot.ts          # TelegramBotService (wraps GramIO)
│   │   ├── service.handler.ts      # TelegramMessageHandler
│   │   ├── service.markdown.ts     # Markdown → Telegram MarkdownV2 conversion
│   │   └── service.split.ts        # Message splitting for 4096-char limit
│   ├── repo/
│   │   └── repo.ts                 # TelegramChatRepo
│   ├── database/
│   │   └── database.ts             # Schema + migrations
│   ├── schemas/
│   │   └── schemas.ts              # Zod schemas + types
│   ├── tools/
│   │   ├── tools.ts
│   │   ├── tools.send-message.ts
│   │   ├── tools.set-model.ts
│   │   └── tools.list-chats.ts
│   └── exports.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Resolved Questions

1. **Markdown handling**: Convert standard Markdown to Telegram MarkdownV2. Fall back to plain text on conversion failure.
2. **Message length limits**: Auto-split at 4096 characters, preferring paragraph/line boundaries.
3. **Typing indicator**: Skipped for now — can be added later if needed.
