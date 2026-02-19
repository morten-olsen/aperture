# Usage Plugin

The usage plugin provides token usage and cost tracking for AI model calls. It queries the prompt store to aggregate usage statistics across time ranges, users, and models.

## Registration

```typescript
import { usagePlugin } from '@morten-olsen/agentic-usage';

await pluginService.register(usagePlugin);
```

No configuration options. Plugin ID: `'usage'`.

## Available Tools

### `usage.get`

Get a token usage and cost summary. Defaults to the last 24 hours.

```typescript
// Input
{
  after: "2026-02-18T00:00:00Z",    // optional — defaults to 24 hours ago
  before: "2026-02-19T00:00:00Z",   // optional
  userId: "alice",                    // optional
  resolvedModel: "gpt-4o"            // optional
}

// Output
{
  promptCount: 42,
  inputTokens: 125000,
  outputTokens: 48000,
  totalTokens: 173000,
  reasoningTokens: 12000,
  cost: 2.45,                        // null if cost data unavailable
  byModel: [
    {
      resolvedModel: "gpt-4o",
      promptCount: 30,
      inputTokens: 100000,
      outputTokens: 40000,
      totalTokens: 140000,
      reasoningTokens: 10000,
      cost: 2.10
    },
    // ...
  ]
}
```

## How It Works

The tool queries `PromptStoreService.getUsageSummary()` from `@morten-olsen/agentic-database`, which aggregates token counts and costs from stored prompt records. No additional database is needed — it reads from the existing prompt store.

## Dependencies

- `@morten-olsen/agentic-core` — plugin and tool definitions
- `@morten-olsen/agentic-database` — PromptStoreService for querying usage data
