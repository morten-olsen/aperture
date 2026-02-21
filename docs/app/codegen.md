# Codegen — Typed Tool & Event Bindings

The codegen script generates TypeScript types from the API's tool and event schemas so that `invokeTool`, `useToolQuery`, `useToolInvoke`, and SSE event handlers are fully type-safe.

## Generated Types

### Tools (`src/generated/tools.ts`)

| Type | Description |
|---|---|
| `ToolId` | Union of all tool ID string literals (e.g. `"conversation.list" \| "conversation.get" \| ...`) |
| `ToolInputMap` | Mapped type: `{ [toolId]: inputType }` |
| `ToolOutputMap` | Mapped type: `{ [toolId]: outputType }` |
| `ToolInput<T>` | Helper — `ToolInputMap[T]` |
| `ToolOutput<T>` | Helper — `ToolOutputMap[T]` |

`userId` is stripped from all input types since the server injects it from the `X-User-Id` header.

### Events (`src/generated/events.ts`)

| Type | Description |
|---|---|
| `EventId` | Union of all event ID string literals (e.g. `"prompt.completed" \| "prompt.output" \| ...`) |
| `EventDataMap` | Mapped type: `{ [eventId]: dataType }` |
| `EventData<T>` | Helper — `EventDataMap[T]` |
| `knownEventIds` | Runtime constant — array of all event IDs (used by native SSE client for listener registration) |

## Running the Script

```bash
# Against a running server (fetches fresh schemas, updates snapshot)
pnpm --filter @morten-olsen/agentic-expo generate

# Or directly with tsx
npx tsx apps/expo/scripts/generate-tool-types.ts --server http://localhost:4000/api

# From a saved snapshot (no server needed)
npx tsx apps/expo/scripts/generate-tool-types.ts --snapshot apps/expo/tools.snapshot.json

# Default (no flags) reads from apps/expo/tools.snapshot.json
npx tsx apps/expo/scripts/generate-tool-types.ts
```

## Workflow

1. Start the API server
2. Run `pnpm --filter @morten-olsen/agentic-expo generate`
3. The script fetches `GET /api/tools` and `GET /api/events`, saves both to `tools.snapshot.json`, then generates `src/generated/tools.ts` and `src/generated/events.ts`
4. Commit all files — this lets CI and other developers build without a running server

When tools or events are added or their schemas change, re-run the script against a running server to update the snapshot and generated types.

## How It Works

The script (`apps/expo/scripts/generate-tool-types.ts`):

1. Fetches the tool list from `GET {server}/tools` (or reads from snapshot)
2. For each tool, converts JSON Schema to a TypeScript type string using a recursive converter
3. Strips `userId` from input types
4. Emits the type file

### JSON Schema Support

The converter handles the patterns used by the framework's Zod-to-JSON-Schema output:

| JSON Schema | TypeScript |
|---|---|
| `{ type: "string" }` | `string` |
| `{ type: "number" }` | `number` |
| `{ type: "boolean" }` | `boolean` |
| `{ type: "null" }` | `null` |
| `{ type: "array", items: T }` | `T[]` |
| `{ type: "object", properties: {...} }` | `{ key: type; key?: type; }` |
| `{ type: "string", enum: [...] }` | `"a" \| "b"` |
| `{ anyOf: [T, { type: "null" }] }` | `T \| null` |
| `{}` (empty schema) | `unknown` |

## Files

| File | Committed | Eslint-ignored |
|---|---|---|
| `scripts/generate-tool-types.ts` | Yes | No |
| `tools.snapshot.json` | Yes | N/A |
| `src/generated/tools.ts` | Yes | Yes (`**/generated/`) |
| `src/generated/events.ts` | Yes | Yes (`**/generated/`) |
