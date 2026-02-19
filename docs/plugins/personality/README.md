# Personality Plugin

The personality plugin stores a per-user personality description (tone, style, behavior preferences). The stored text is automatically injected into every prompt as context, so the agent adopts the configured personality.

## Registration

```typescript
import { personalityPlugin } from '@morten-olsen/agentic-personality';

await pluginService.register(personalityPlugin);
```

No configuration options. Plugin ID: `'personality'`.

## Available Tools

### `personality.update`

Update the personality description. The new content completely replaces the previous one.

```typescript
// Input
{
  content: "You are a friendly assistant who uses casual language and occasionally makes jokes. Keep responses concise."
  // max 2000 characters
}

// Output
{ success: true }
```

## Context Injection

On each prompt, if a personality has been set for the current user, the plugin injects the full content as a context item of type `'personality'`. This means the agent automatically adopts the personality without needing to be told.

## Database

Database ID: `personality`

### `personality_entries`

| Column       | Type         | Notes                              |
|--------------|--------------|------------------------------------|
| `user_id`    | varchar(255) | PK — one personality per user      |
| `content`    | text         | The personality description        |
| `created_at` | text         | ISO 8601 timestamp                 |
| `updated_at` | text         | ISO 8601 timestamp                 |

## Dependencies

- `@morten-olsen/agentic-core` — plugin and tool definitions
- `@morten-olsen/agentic-database` — database creation and DatabaseService
