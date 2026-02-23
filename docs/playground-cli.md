# Playground CLI

The playground package includes a lightweight CLI for interacting with a running GLaDOS server over HTTP. It's designed for remote debugging — inspecting tools, invoking them directly, and streaming prompts — without needing a full UI.

## Setup

The CLI reads configuration from environment variables (supports `.env` via `dotenv`):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GLADOS_URL` | Yes | — | Server base URL, e.g. `https://glados.olsen.cloud` |
| `GLADOS_USER_ID` | No | `"cli"` | Value sent as the `X-User-Id` header |

## Running

```bash
# Via pnpm script
pnpm --filter @morten-olsen/agentic-playground cli <command> [args]

# Or directly with tsx
npx tsx packages/playground/src/cli/cli.ts <command> [args]
```

All commands output JSON to stdout. Diagnostic messages (prompt IDs, errors) go to stderr, keeping stdout clean for piping.

## Commands

### `tools`

List all registered tools with their IDs and descriptions.

```bash
pnpm --filter @morten-olsen/agentic-playground cli tools
```

### `tool-schema <toolId>`

Get the input/output JSON Schema for a specific tool.

```bash
pnpm --filter @morten-olsen/agentic-playground cli tool-schema configuration.connections.types
```

### `invoke <toolId> [jsonInput]`

Invoke a tool directly and print the result. The optional `jsonInput` argument is a JSON string parsed as the tool's input.

```bash
# No input
pnpm --filter @morten-olsen/agentic-playground cli invoke configuration.connections.types

# With input
pnpm --filter @morten-olsen/agentic-playground cli invoke trigger.create '{"name":"test","cron":"0 * * * *"}'
```

### `prompt <message> [-c conversationId]`

Send a prompt to the agent and stream SSE events as NDJSON (one JSON object per line). The command resolves when the prompt completes or errors, with a 5-minute timeout.

```bash
# New conversation
pnpm --filter @morten-olsen/agentic-playground cli prompt "What tools do you have?"

# Continue an existing conversation
pnpm --filter @morten-olsen/agentic-playground cli prompt "Tell me more" -c my-session
```

Each line is a JSON object with `event` and `data` fields:

```jsonl
{"event":"prompt.created","data":{"promptId":"abc123","userId":"cli"}}
{"event":"prompt.output","data":{"promptId":"abc123","output":{"type":"text","content":"Hello!"}}}
{"event":"prompt.completed","data":{"promptId":"abc123","output":[...],"usage":{...}}}
```

**SSE event types:**

| Event | Description |
|-------|-------------|
| `prompt.created` | Prompt accepted by the server |
| `prompt.output` | Incremental output (text, tool call, or file) |
| `prompt.approval-requested` | A tool call requires manual approval |
| `prompt.completed` | Prompt finished successfully |
| `prompt.error` | Prompt failed |

### `capabilities`

List registered plugins and server capabilities.

```bash
pnpm --filter @morten-olsen/agentic-playground cli capabilities
```

## Debugging Workflow

A typical debugging session for a remote server:

```bash
# 1. Check what the server has registered
pnpm --filter @morten-olsen/agentic-playground cli capabilities

# 2. List available tools
pnpm --filter @morten-olsen/agentic-playground cli tools

# 3. Check the schema for a tool you want to test
pnpm --filter @morten-olsen/agentic-playground cli tool-schema configuration.connections.types

# 4. Invoke the tool directly to verify it works
pnpm --filter @morten-olsen/agentic-playground cli invoke configuration.connections.types

# 5. Test through the full agent loop
pnpm --filter @morten-olsen/agentic-playground cli prompt "List my calendar connections"
```

## Implementation

The CLI is built on `@morten-olsen/agentic-client` (`ApertureClient`), which provides typed HTTP methods for tools, prompts, events, and raw requests. No additional dependencies are needed beyond what the client package provides.

| File | Purpose |
|------|---------|
| `src/cli/cli.ts` | Entry point — arg parsing via `node:util` `parseArgs`, command dispatch |
| `src/cli/cli.client.ts` | Creates an `ApertureClient` from env vars |
| `src/cli/cli.commands.ts` | Command implementations |
