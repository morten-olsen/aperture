# 010: API Service

**Status**: Draft

## Overview

The API service exposes the agentic framework over HTTP using Fastify, allowing external clients to discover and invoke tools, and run prompts with SSE streaming. The service auto-generates an OpenAPI specification from Zod schemas via `fastify-type-provider-zod` and serves interactive API documentation via Scalar.

The API surface is intentionally minimal: tool exposure and a prompt endpoint. Plugins that need richer client interaction (e.g., conversation management) expose their own functionality as tools, which the API automatically makes available. A client can discover all available capabilities by listing tools — no plugin-specific endpoints or coupling required.

## Scope

### Included

- `@morten-olsen/agentic-api` package with `ApiService` and `apiPlugin`
- Plugin lifecycle extension: `ready` hook on `Plugin`, `start()` on `PluginService`
- Fastify server with Zod type provider and Scalar API reference
- Tool exposure with OpenAPI tagging: list tools, get schema, invoke directly
- Prompt endpoint with SSE streaming for agent loop output (with optional `conversationId` for multi-turn)
- Approval flow over HTTP (approve/reject pending tool calls)
- Capabilities discovery endpoint
- Minimal auth via `X-User-Id` header
- API-only conversation tools in the conversation plugin (`conversation.create`, `conversation.list`, `conversation.get`, `conversation.delete`)

### Out of Scope

- Full authentication/authorization (OAuth, JWT, API keys) — future spec
- Auto-generated client SDK
- WebSocket transport
- File upload/download endpoints
- Rate limiting, request quotas
- Token-level streaming (SSE streams final outputs only; streaming is future work)

## Plugin Lifecycle Extension

### Problem

The API plugin needs to start its HTTP listener **after** all other plugins have registered their tools and routes, but `setup()` is called immediately during `register()` — there is no "all plugins are ready" signal.

### Solution

Add a `ready` hook to the `Plugin` type and a `start()` method to `PluginService`.

#### Plugin Type Change

```typescript
type Plugin<TState, TConfig> = {
  // ... existing fields ...
  readonly ready?: (input: PluginSetupInput<TConfig>) => Promise<void>;
};
```

`ready` receives the same input shape as `setup`. It is optional and backward-compatible — existing plugins ignore it.

#### PluginService.start()

```typescript
class PluginService {
  // ... existing methods ...

  public start = async () => {
    for (const [, { plugin, config }] of this.#plugins) {
      await plugin.ready?.({
        config,
        services: this.#services,
        secrets: this.#services.secrets,
      });
    }
  };
}
```

Calls `ready()` on every registered plugin in registration order. The server calls `start()` once after all `register()` calls complete.

#### Updated Server Bootstrap

```typescript
// Phase 1: Register plugins (calls setup() on each)
await pluginService.register(databasePlugin, { ... });
await pluginService.register(conversationPlugin, undefined);
await pluginService.register(triggerPlugin, undefined);
// ... more plugins ...
await pluginService.register(apiPlugin, { port: 3000, host: '0.0.0.0' });

// Phase 2: Start (calls ready() on all plugins in order)
await pluginService.start();
```

The API plugin's `setup()` creates the Fastify instance and registers routes. Its `ready()` starts the HTTP listener — guaranteed to run after every other plugin's `setup()` has completed.

## API / Service Layer

### ApiService

A service in the DI container (`services.get(ApiService)`). Accumulates tool and route registrations, then materializes the Fastify server when `start()` is called.

```typescript
class ApiService {
  constructor(services: Services)

  // Tool exposure
  exposeTool(tool: Tool, options?: ExposeToolOptions): void
  exposeTools(tools: Tool[], options?: ExposeToolOptions): void

  // Custom route registration (for plugin-specific non-tool endpoints)
  registerRoute(config: ApiRouteConfig): void

  // Lifecycle
  start(options: ApiStartOptions): Promise<void>
  stop(): Promise<void>
}

type ExposeToolOptions = {
  tag?: string;           // OpenAPI tag for grouping (e.g., 'Triggers', 'Conversations')
};

type ApiStartOptions = {
  port: number;
  host?: string;          // default '0.0.0.0'
};

type ApiRouteConfig = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  schema: {
    body?: ZodType;
    querystring?: ZodType;
    params?: ZodType;
    response?: Record<number, ZodType>;
  };
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};
```

### Tool Wiring

The **server package** (composition root) wires tools to the API. Plugin packages export their tool arrays; the server selectively exposes them:

```typescript
import { triggerTools } from '@morten-olsen/agentic-trigger';
import { filesystemTools } from '@morten-olsen/agentic-filesystem';
import { conversationApiTools } from '@morten-olsen/agentic-conversation';

const apiService = services.get(ApiService);
apiService.exposeTools(triggerTools, { tag: 'Triggers' });
apiService.exposeTools(filesystemTools, { tag: 'Filesystem' });
apiService.exposeTools(conversationApiTools, { tag: 'Conversations' });
```

The optional `tag` groups tools under a heading in the OpenAPI spec and Scalar docs. Tools without a tag appear under a default group.

This keeps plugin packages decoupled from the API package. Plugins do not need to import or know about `ApiService`.

## HTTP Endpoints

All endpoints require the `X-User-Id` header. Requests without it receive `401 Unauthorized`.

### Capabilities

```
GET /api/capabilities
```

Response `200`:
```json
{
  "plugins": ["conversation", "trigger", "filesystem", "time"]
}
```

Lists registered plugin IDs. Clients discover specific capabilities by checking the tool list — e.g., the presence of `conversation.create` indicates multi-turn conversation support.

### Tools

#### List Tools

```
GET /api/tools
```

Response `200`:
```json
{
  "tools": [
    {
      "id": "trigger.create",
      "description": "Create a new scheduled trigger",
      "tag": "Triggers",
      "input": { /* JSON Schema from tool.input */ },
      "output": { /* JSON Schema from tool.output */ }
    }
  ]
}
```

#### Invoke Tool

```
POST /api/tools/:toolId/invoke
Content-Type: application/json

{ /* tool-specific input validated against tool.input */ }
```

Response `200`:
```json
{
  "result": { /* tool output */ }
}
```

Response `404` if tool not found. Response `422` if input validation fails (Zod error details in body).

Tool invocation context:
- `userId`: from `X-User-Id` header
- `input`: from request body (validated against `tool.input`)
- `state`: empty (`State.fromInit({})`)
- `services`: from DI container
- `secrets`: from services
- `addFileOutput`: no-op

### Prompt

```
POST /api/prompt
Content-Type: application/json

{
  "input": "What time is it?",
  "model": "normal",
  "conversationId": "conv-123"
}
```

Response: `200` with `Content-Type: text/event-stream` (SSE).

| Field | Required | Description |
|-------|----------|-------------|
| `input` | yes | The user's message |
| `model` | no | `'normal'` (default) or `'high'` |
| `conversationId` | no | Run the prompt within a conversation context |

**Without `conversationId`**: Creates a `PromptCompletion` via `PromptService.create()` with no history and empty state. Each request is an independent single-turn interaction.

**With `conversationId`**: Loads the conversation via `ConversationService.get(id, userId)` (including full prompt history and persisted state), then calls `conversation.prompt()`. Requires the conversation plugin to be registered — returns `422` if it is not. The client creates and manages conversations via conversation tools (e.g., `conversation.create`, `conversation.list`).

#### Approve / Reject

```
POST /api/prompts/:promptId/approve
Content-Type: application/json

{ "toolCallId": "call_abc123" }
```

```
POST /api/prompts/:promptId/reject
Content-Type: application/json

{
  "toolCallId": "call_abc123",
  "reason": "Not authorized"
}
```

Response `200` on success. Response `404` if prompt not found or not in `waiting_for_approval` state.

After approval/rejection, the SSE stream for the original prompt request continues with the remaining agent loop output.

## SSE Protocol

The prompt endpoint returns an SSE stream. The connection stays open until the prompt completes or an error occurs.

Events carry **final outputs only** — completed tool results and finished text responses. Intermediate model output (partial text, thinking/reasoning tokens) is not streamed. Token-level streaming may be added in a future iteration.

### Events

| Event | Payload | When |
|-------|---------|------|
| `prompt.created` | `{ promptId }` | Immediately after prompt is created |
| `prompt.output` | `PromptOutput` (text, tool, or file) | Each time a new output entry is added |
| `prompt.approval` | `{ promptId, toolCallId, toolName, input, reason }` | Tool requires human approval |
| `prompt.completed` | `{ promptId, usage }` | Agent loop finished |
| `error` | `{ message }` | Unrecoverable error |

### Example Stream

```
event: prompt.created
data: {"promptId":"p-123"}

event: prompt.output
data: {"type":"tool","id":"call-1","function":"time.now","input":{},"result":{"type":"success","output":{"time":"2026-02-20T10:00:00Z"}},"start":"...","end":"..."}

event: prompt.output
data: {"type":"text","content":"The current time is 10:00 AM.","start":"...","end":"..."}

event: prompt.completed
data: {"promptId":"p-123","usage":{"inputTokens":150,"outputTokens":42,"totalTokens":192}}
```

### Approval Flow

When a tool requires approval, the stream pauses:

```
event: prompt.approval
data: {"promptId":"p-123","toolCallId":"call-2","toolName":"shell.exec","input":{"command":"ls -la"},"reason":"Shell command execution"}
```

The client calls `POST /api/prompts/p-123/approve` (or `reject`). The stream then resumes with the tool result and any subsequent outputs.

### Implementation

The SSE stream is driven by `PromptCompletion` events:
- Subscribe to `updated` — diff the output array since last emission, emit `prompt.output` for each new entry
- Subscribe to `approval-requested` — emit `prompt.approval`
- Subscribe to `completed` — emit `prompt.completed`, close the stream

## Error Handling

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Missing `X-User-Id` header | 401 | `AUTH_REQUIRED` |
| Tool not found | 404 | `TOOL_NOT_FOUND` |
| Prompt not found | 404 | `PROMPT_NOT_FOUND` |
| `conversationId` provided but conversation plugin not registered | 422 | `FEATURE_UNAVAILABLE` |
| Input validation failure (Zod) | 422 | `VALIDATION_ERROR` |
| Tool invocation error | 500 | `TOOL_ERROR` |
| Model/provider error | 502 | `MODEL_ERROR` |

Error response body:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input for tool trigger.create",
    "details": { /* Zod error issues */ }
  }
}
```

## Configuration

The API plugin accepts:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | `3000` | HTTP listen port |
| `host` | string | `'0.0.0.0'` | Bind address |
| `cors` | `{ origin: string \| string[] }` | `undefined` | CORS configuration (disabled if omitted) |
| `prefix` | string | `'/api'` | Route prefix for all endpoints |

Environment variable overrides (in server package config):

| Env Var | Maps To |
|---------|---------|
| `API_PORT` | `port` |
| `API_HOST` | `host` |
| `API_CORS_ORIGIN` | `cors.origin` |

## Plugin Behavior

### Setup

1. Create `ApiService` instance (via `services.get(ApiService)`)
2. Create Fastify instance with `ZodTypeProvider` and Scalar plugin
3. Register core routes: `/api/capabilities`, `/api/tools`, `/api/prompt`, `/api/prompts/:id/approve`, `/api/prompts/:id/reject`
4. Register routes for all explicitly exposed tools

### Ready

1. Call `apiService.start({ port, host })` — Fastify begins listening
2. Log the server URL and Scalar docs URL

## External Dependencies

- **fastify** — HTTP framework
- **@fastify/cors** — CORS support
- **fastify-type-provider-zod** — Zod integration for request/response validation and OpenAPI schema generation
- **@scalar/fastify-api-reference** — Interactive API documentation from OpenAPI spec
- **@fastify/swagger** — OpenAPI spec generation (required by Scalar)

## Boundary

### This package owns

- Fastify server lifecycle (create, configure, listen, stop)
- HTTP route registration and request handling
- SSE streaming protocol for prompt output
- Tool-to-REST endpoint mapping
- OpenAPI spec generation and Scalar docs
- `X-User-Id` header extraction

### Other packages handle

- **core**: Plugin lifecycle (`ready` hook addition), `PluginService.start()`, `PromptCompletion`, tool definitions, `State`
- **conversation**: Conversation persistence, history management, `ConversationService`. Exposes conversation CRUD as API-only tools (see below).
- **database**: Prompt storage via `PromptStoreService`
- **server**: Plugin composition — deciding which plugins to register and which tools to expose via API

## Conversation Tools

The conversation plugin currently exposes no tools — it is pure infrastructure. As part of this spec, the conversation plugin gains a set of **API-only tools** for client-driven conversation management. These tools are exported separately from the plugin's agent tools and are **not injected into the agent's tool list during `prepare()`** — they exist solely for REST clients.

### Exported as `conversationApiTools`

The conversation package exports a `conversationApiTools` array that the server package wires to the API:

```typescript
import { conversationApiTools } from '@morten-olsen/agentic-conversation';

apiService.exposeTools(conversationApiTools, { tag: 'Conversations' });
```

### `conversation.create`

Creates a new conversation for the current user.

Input:
```typescript
z.object({})  // no required fields; userId comes from the API's X-User-Id header
```

Output:
```typescript
z.object({
  id: z.string(),
})
```

The tool creates a `ConversationInstance` via `ConversationService.create({ userId })` and returns its ID. The client passes this ID as `conversationId` to the prompt endpoint for multi-turn chat.

### `conversation.list`

Lists conversations for the current user, ordered by most recently updated.

Input:
```typescript
z.object({
  limit: z.number().optional(),   // default 20
  offset: z.number().optional(),  // default 0
})
```

Output:
```typescript
z.object({
  conversations: z.array(z.object({
    id: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
})
```

### `conversation.get`

Retrieves a conversation with its prompt history.

Input:
```typescript
z.object({
  conversationId: z.string(),
})
```

Output:
```typescript
z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  prompts: z.array(promptSchema),
})
```

Loads the conversation via `ConversationService.get(id, userId)` and returns the full prompt history. Useful for rehydrating a chat UI on reconnection.

### `conversation.delete`

Deletes a conversation and its prompt associations.

Input:
```typescript
z.object({
  conversationId: z.string(),
})
```

Output:
```typescript
z.object({
  deleted: z.boolean(),
})
```

Removes the conversation record and its prompt junction rows. The prompts themselves are retained in the prompt store (they may be referenced by other systems like triggers).

### Why API-Only

These tools are not added to the agent's tool list because:

1. The agent has no reason to create or list conversations — it operates within a conversation, not across them.
2. Exposing conversation management to the agent would let it manipulate its own context in unexpected ways.
3. Keeping them API-only ensures a clean separation between client-facing CRUD and agent-facing capabilities.

## Future Work

- **Token-level streaming**: Extend the SSE protocol to stream partial text and reasoning tokens as they arrive from the model.
- **Full authentication**: OAuth/JWT-based auth replacing the `X-User-Id` header.
- **Auto-generated client SDK**: TypeScript client generated from the OpenAPI spec.
