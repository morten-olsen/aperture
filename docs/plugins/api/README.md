# API Plugin

The API plugin exposes the agentic framework over HTTP via Fastify. It provides a minimal, plugin-agnostic surface: tool discovery and invocation, plus a prompt endpoint with SSE streaming. Plugins expose their own capabilities as tools, which the API automatically makes available — no plugin-specific endpoints required.

OpenAPI documentation is auto-generated from Zod schemas (via `fastify-type-provider-zod`) and served interactively through Scalar.

## Registration

```typescript
import { apiPlugin } from '@morten-olsen/agentic-api';

await pluginService.register(apiPlugin, {
  port: 3000,
  host: '0.0.0.0',
  cors: { origin: 'http://localhost:5173' },  // optional
  prefix: '/api',                              // optional, default '/api'
});
```

The API plugin should be registered **last**, after all other plugins, so that tools and routes from other plugins are available when the Fastify instance is configured. The server is started in the `ready()` lifecycle hook (see [Plugin Lifecycle](#plugin-lifecycle) below).

## Plugin Lifecycle

The API plugin relies on the `ready` hook — a lifecycle phase that runs after **all** plugins have completed `setup()`. This guarantees every tool and route is registered before the HTTP server starts listening.

```typescript
// 1. Register all plugins (each calls setup())
await pluginService.register(databasePlugin, { ... });
await pluginService.register(conversationPlugin, undefined);
await pluginService.register(triggerPlugin, undefined);
await pluginService.register(apiPlugin, { port: 3000 });

// 2. Wire tools to the API (with optional OpenAPI tags)
const apiService = services.get(ApiService);
apiService.exposeTools(triggerTools, { tag: 'Triggers' });
apiService.exposeTools(conversationApiTools, { tag: 'Conversations' });

// 3. Start all plugins (each calls ready())
// The API plugin starts the Fastify server in ready()
await pluginService.start();
```

## Exposing Tools

The `ApiService` accepts tools for REST exposure. Each exposed tool gets:
- A typed entry in `GET /api/tools` (with JSON Schema for input/output)
- An invocation endpoint at `POST /api/tools/:toolId/invoke`
- A fully typed operation in the auto-generated OpenAPI spec

```typescript
import { ApiService } from '@morten-olsen/agentic-api';
import { triggerTools } from '@morten-olsen/agentic-trigger';

const apiService = services.get(ApiService);

// Expose a batch of tools with an OpenAPI tag
apiService.exposeTools(triggerTools, { tag: 'Triggers' });

// Expose a single tool (no tag — appears under default group)
apiService.exposeTool(myCustomTool);
```

The optional `tag` groups tools under a heading in the OpenAPI spec and Scalar docs. Tools exposed without a tag appear under a default group.

Tool wiring is done in the **server package** (the composition root), keeping plugin packages decoupled from the API.

## Custom Routes

Plugins can register arbitrary Fastify routes for functionality that doesn't map to a single tool invocation:

```typescript
apiService.registerRoute({
  method: 'GET',
  path: '/api/health',
  schema: {
    response: { 200: z.object({ status: z.literal('ok') }) },
  },
  handler: async (_request, reply) => {
    reply.send({ status: 'ok' });
  },
});
```

Custom routes appear in the OpenAPI spec alongside tool routes.

## Client Guide

### Authentication

All endpoints require an `X-User-Id` header identifying the caller:

```
X-User-Id: alice
```

Requests without this header receive `401 Unauthorized`.

### Discovering Capabilities

```
GET /api/capabilities
```

Returns the list of registered plugin IDs:

```json
{
  "plugins": ["conversation", "trigger", "filesystem", "time"]
}
```

To discover specific features, check the tool list. For example, the presence of `conversation.create` in the tool list indicates multi-turn conversation support.

### Listing Tools

```
GET /api/tools
```

```json
{
  "tools": [
    {
      "id": "trigger.create",
      "description": "Create a new scheduled trigger",
      "tag": "Triggers",
      "input": { "type": "object", "properties": { "..." } },
      "output": { "type": "object", "properties": { "..." } }
    }
  ]
}
```

The `input` and `output` fields are JSON Schemas derived from the tool's Zod schemas. The `tag` field corresponds to the OpenAPI tag set during `exposeTools()`. Use these to validate requests client-side, group tools in a UI, or auto-generate typed clients.

### Invoking a Tool Directly

```
POST /api/tools/trigger.list/invoke
Content-Type: application/json
X-User-Id: alice

{ "status": "active", "limit": 10 }
```

```json
{
  "result": [
    { "id": "t-1", "name": "Daily Briefing", "status": "active" }
  ]
}
```

Direct invocation runs the tool outside of the agent loop — no LLM involved, no conversation state. Useful for building dashboards or admin interfaces.

### Sending a Prompt (Single-Turn)

```
POST /api/prompt
Content-Type: application/json
X-User-Id: alice

{ "input": "What time is it?", "model": "normal" }
```

The response is an SSE stream (`Content-Type: text/event-stream`). Events carry final outputs only — completed tool results and finished text responses. Token-level streaming may be added in a future iteration.

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

Without a `conversationId`, each prompt is independent — no history is carried between requests.

### Sending a Prompt (Multi-Turn Conversation)

If the conversation plugin is registered, clients can manage conversations through conversation tools and pass a `conversationId` to the prompt endpoint:

```
POST /api/prompt
Content-Type: application/json
X-User-Id: alice

{
  "input": "What meetings do I have today?",
  "model": "normal",
  "conversationId": "conv-abc"
}
```

The server loads the conversation (including full prompt history and persisted plugin state) and runs the prompt within that context. Subsequent prompts to the same conversation carry the full history.

**Typical multi-turn flow:**

1. Check if conversation tools are available: look for `conversation.create` in `GET /api/tools`
2. Create a conversation: `POST /api/tools/conversation.create/invoke`
3. Send prompts with the returned `conversationId`
4. List past conversations: `POST /api/tools/conversation.list/invoke`

If `conversationId` is provided but the conversation plugin is not registered, the server returns `422 FEATURE_UNAVAILABLE`.

### Handling Tool Approval

Some tools require human approval before execution. When this happens, the SSE stream pauses and emits an approval event:

```
event: prompt.approval-requested
data: {"promptId":"p-123","request":{"toolCallId":"call-2","toolName":"shell.exec","input":{"command":"ls -la"},"reason":"Shell command execution"}}
```

The client should display the pending action to the user, then call one of:

**Approve:**
```
POST /api/prompts/p-123/approve
Content-Type: application/json
X-User-Id: alice

{ "toolCallId": "call-2" }
```

**Reject:**
```
POST /api/prompts/p-123/reject
Content-Type: application/json
X-User-Id: alice

{ "toolCallId": "call-2", "reason": "Not authorized" }
```

After approval or rejection, the SSE stream resumes with the tool result and any subsequent agent loop output.

### SSE Event Reference

Events are extensible — plugins register their own events via `EventService`, and all registered events are automatically forwarded over SSE. Use `GET /api/events` to discover all available events and their schemas.

Built-in prompt events:

| Event | Payload | Description |
|-------|---------|-------------|
| `prompt.created` | `{ promptId, userId }` | Prompt created, agent loop starting |
| `prompt.output` | `{ promptId, output: PromptOutput }` | New output entry (text, tool call, or file) |
| `prompt.approval-requested` | `{ promptId, request: { toolCallId, toolName, input, reason } }` | Tool paused, awaiting human approval |
| `prompt.completed` | `{ promptId, output: PromptOutput[], usage? }` | Agent loop finished |
| `prompt.error` | `{ promptId, error }` | Unrecoverable error |
| `notification.published` | `{ userId, title, body, urgency? }` | Notification sent |

`PromptOutput` is one of:
- `{ type: "text", content: "...", start, end }` — model text response
- `{ type: "tool", id, function, input, result: { type, output|error }, start, end }` — tool invocation
- `{ type: "file", path, mimeType?, description?, start, end }` — file output

See [Events](../../events.md) for full documentation on the event system.

### Error Responses

Non-SSE endpoints return errors as:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input for tool trigger.create",
    "details": {}
  }
}
```

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `AUTH_REQUIRED` | 401 | Missing `X-User-Id` header |
| `TOOL_NOT_FOUND` | 404 | No exposed tool with that ID |
| `PROMPT_NOT_FOUND` | 404 | No active prompt with that ID |
| `FEATURE_UNAVAILABLE` | 422 | `conversationId` provided but conversation plugin not registered |
| `VALIDATION_ERROR` | 422 | Request body failed Zod validation |
| `TOOL_ERROR` | 500 | Tool threw during invocation |
| `MODEL_ERROR` | 502 | LLM provider returned an error |

## OpenAPI & Scalar Docs

When the server is running, interactive API documentation is available at:

```
http://localhost:3000/api/docs
```

The OpenAPI spec is generated automatically from route schemas. Each exposed tool appears as a distinct operation with fully typed request/response schemas derived from its Zod definitions.

## Configuration

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

## Dependencies

- `@morten-olsen/agentic-core` — plugin creation, `PromptService`, `PluginService`, tool types
- **fastify** — HTTP framework
- **@fastify/cors** — CORS support
- **@fastify/swagger** — OpenAPI spec generation
- **fastify-type-provider-zod** — Zod schema integration
- **@scalar/fastify-api-reference** — Interactive API docs
