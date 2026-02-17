# Telegram Plugin

The telegram plugin connects the agent to Telegram via the Gramio bot framework. It handles incoming messages, routes them through the conversation system, and sends responses back with MarkdownV2 formatting. Supports per-chat model overrides and notification delivery.

## Registration

```typescript
import { createTelegramPlugin } from '@morten-olsen/agentic-telegram';

const plugin = createTelegramPlugin({
  token: process.env.TELEGRAM_TOKEN!,
  users: [
    { chatId: '12345678', userId: 'alice' },
    { chatId: '87654321', userId: 'bob' },
  ],
});
await pluginService.register(plugin);
```

### Options

| Option | Description |
|--------|-------------|
| `token` | Telegram bot token (required) |
| `users` | Array of `{ chatId, userId }` mappings. Only messages from mapped chats are processed. |

## Available Tools

### `telegram.listChats`

Lists all Telegram chats the bot has interacted with. Always available.

```typescript
// input
{}
// output
{ chats: [{ id, telegramChatId, chatType, title, username }] }
```

### `telegram.sendMessage`

Sends an additional message to the current Telegram chat. Only available during an active chat conversation.

```typescript
{ text: "Here's the report you asked for." }
```

### `telegram.setModel`

Overrides the AI model for the current chat. Pass `null` to reset to default. Only available during an active chat conversation.

```typescript
{ model: "high" }   // use high-tier model
{ model: null }     // reset to default
```

## Message Flow

1. Gramio polls for incoming messages via long-polling
2. Plugin filters by registered user `chatId` — unrecognized chats are silently ignored
3. `TelegramMessageHandler` enqueues messages per-chat to maintain strict ordering
4. `/new` command creates a fresh conversation for the chat
5. Regular text creates or resumes a conversation via `ConversationService`
6. `conversation.prompt()` runs the agent loop with Telegram state injected
7. On completion, the response is formatted and sent back

## Telegram State

During active chat conversations, the plugin injects state and context:

```typescript
// Plugin state
{
  chat: {
    id: "uuid",
    telegramChatId: "12345678",
    chatType: "private",  // or 'group', 'supergroup', 'channel'
    title: "My Group",    // optional
    username: "alice",    // optional
  }
}
```

The prepare hook checks for this state to decide which tools to provide:
- **No chat state**: only `telegram.listChats`
- **Chat state present**: `telegram.listChats` + `telegram.sendMessage` + `telegram.setModel`, plus context about the chat

## Markdown Handling

Responses are converted from standard Markdown to Telegram MarkdownV2:

| Markdown | MarkdownV2 |
|----------|-----------|
| `**bold**` | `*bold*` |
| `*italic*` | `_italic_` |
| `~~strike~~` | `~strike~` |
| `[text](url)` | `[text](url)` |
| `` `code` `` | `` `code` `` (preserved) |
| ```` ```code``` ```` | ```` ```code``` ```` (preserved) |
| `# Heading` | `*Heading*` |

All special characters outside formatting are escaped. If MarkdownV2 conversion fails, the message is sent as plain text.

### Message Splitting

Messages exceeding Telegram's 4096-character limit are split across multiple messages. The splitter respects paragraph boundaries and maintains code block integrity across chunks.

## Notification Integration

Notifications published via `NotificationService` are automatically sent to mapped Telegram users. The plugin subscribes to the `'published'` event during setup and routes notifications by `userId` → `chatId`.

## Database

Database ID: `telegram`. One table:

**`telegram_chats`** — tracks known chats (PK: `id`)

Columns: `id`, `telegram_chat_id` (indexed), `chat_type`, `title`, `username`, `first_name`, `model` (nullable — per-chat override), `created_at`, `updated_at`

## Dependencies

- `@morten-olsen/agentic-core` — plugin creation, tools, `PromptService` events
- `@morten-olsen/agentic-conversation` — `ConversationService` for managing chat conversations
- `@morten-olsen/agentic-database` — `DatabaseService` for chat persistence
- `@morten-olsen/agentic-notification` — `NotificationService` for outbound notifications
- `gramio` — Telegram Bot API wrapper (polling mode)
