# 011: Expo Client

**Status**: Draft

## Overview

A cross-platform client for the agentic framework, built with Expo (iOS, Android, web). Communicates exclusively through the REST API defined in spec 010. Provides a chat interface with SSE streaming and a human approval flow for gated tool calls.

The client lives in a single `apps/expo` workspace. The API client is a plain class (no React dependency) exposed to components via thin hooks, keeping the transport layer decoupled from the UI framework. Tamagui provides the component library and design token system. TanStack Query manages server state.

### Key Design Decisions

**Typed tool invocations.** The API exposes all capabilities — including conversation management — as tools via `POST /api/tools/:toolId/invoke`. The `GET /api/tools` endpoint returns JSON Schema for each tool's input and output. The client uses these schemas to generate strongly-typed invocation helpers at build time. There are no hand-written per-resource methods; everything is a typed tool call.

**Single SSE event stream.** Instead of opening an SSE connection per prompt, the client maintains a single persistent SSE connection (`GET /api/events`) that receives all prompt lifecycle events for the authenticated user. `POST /api/prompt` is a plain REST call that returns the prompt ID. The event stream then delivers `prompt.output`, `prompt.approval`, and `prompt.completed` events tagged with that prompt ID. This means one connection handles all concurrent prompts, and the client reacts to prompt changes across the entire application (including prompts triggered server-side by triggers or other plugins).

> **API change required**: Spec 010 must be amended to add `GET /api/events` (user-scoped SSE subscription) and change `POST /api/prompt` from an SSE-streaming endpoint to a plain JSON response returning `{ promptId }`. See [API Changes](#api-changes-spec-010-amendment) below.

## Scope

### Included (v1)

- Expo app targeting iOS, Android, and web (via Expo Web / `react-native-web`)
- Chat UI: conversation creation, message input, SSE-streamed responses, prompt history rehydration
- Tool approval flow: display pending approvals inline, approve/reject
- Tamagui design system with light/dark theme
- TanStack Query for all server state (tools, conversations, prompts)
- Build-time code generation of strongly-typed tool invocation helpers from `GET /api/tools` schemas
- `@hey-api/openapi-ts` code generation for the REST endpoints (prompt, capabilities, events)
- Class-based API client (`AgenticClient`) with no React dependency
- Single persistent SSE connection for all prompt events (`GET /api/events`)
- SSE transport abstraction with platform-specific implementations (`.web.ts` / `.native.ts`)
- Storybook via `@storybook/react-native-web-vite` for component development
- Markdown rendering for AI text responses

### Out of Scope

- Tool browser UI (direct tool invocation, schema inspection)
- Push notifications and background sync (future spec)
- Trigger management UI
- File browsing / upload / download
- Usage statistics dashboard
- Plugin configuration screens
- Offline mode and local caching beyond TanStack Query's in-memory cache
- Authentication beyond the `X-User-Id` header (blocked on API auth spec)
- Token-level streaming (blocked on API support, see spec 010 future work)

## App Structure

### Workspace Setup

```
apps/
  expo/
    app/                    # Expo Router file-based routes
      _layout.tsx           # Root layout — TamaguiProvider, QueryClientProvider, client context
      (tabs)/
        _layout.tsx         # Tab navigator
        index.tsx           # Conversations tab (list + new)
        settings.tsx        # Settings (server URL, user ID, theme)
      conversation/
        [id].tsx            # Chat screen for a specific conversation
    src/
      client/               # API client layer (no React)
        client.ts           # AgenticClient class
        client.events.ts    # EventStream types and event dispatching
        client.sse.ts       # SSE connection interface
        client.sse.web.ts   # Web SSE implementation (fetch + ReadableStream)
        client.sse.native.ts # react-native-sse implementation
      generated/
        api/                # @hey-api/openapi-ts output (REST endpoints)
        tools.ts            # Generated typed tool invocation helpers (from GET /api/tools schemas)
      hooks/                # React hooks wrapping the client
        use-client.ts       # Context + hook for AgenticClient
        use-event-stream.ts # Hook managing the persistent SSE connection
        use-prompt.ts       # Hook for sending prompts and tracking their events
      components/           # Shared UI components
        chat/
        approval/
        markdown/
      tamagui.config.ts     # Design tokens, themes, fonts
    .storybook/             # Storybook configuration
    app.json                # Expo config
    babel.config.js         # Tamagui babel plugin
    metro.config.js         # Metro monorepo config (if needed beyond SDK 52 defaults)
    package.json
```

### Monorepo Integration

The app is added to the pnpm workspace:

```yaml
# pnpm-workspace.yaml (add apps/*)
packages:
  - 'packages/*'
  - 'apps/*'
```

The root `.npmrc` needs `node-linker=hoisted` for React Native compatibility. This affects the entire monorepo — existing packages should be tested after the change.

Turborepo gains tasks for the Expo app:

```jsonc
// turbo.json additions
{
  "tasks": {
    "dev:expo": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    }
  }
}
```

The Expo app does **not** depend on any `@morten-olsen/agentic-*` packages at runtime. It communicates solely via HTTP. It may depend on shared config packages (`@morten-olsen/agentic-configs`) for tsconfig inheritance.

## API Client

### AgenticClient

A plain TypeScript class with no React or React Native dependencies. Handles HTTP requests, the persistent SSE connection, and error normalization.

```typescript
type AgenticClientOptions = {
  baseUrl: string;
  userId: string;
};

class AgenticClient {
  constructor(options: AgenticClientOptions)

  // Configuration
  get baseUrl(): string
  get userId(): string

  // Capabilities
  getCapabilities(): Promise<CapabilitiesResponse>

  // Tools — discovery and invocation
  listTools(): Promise<ListToolsResponse>
  invokeTool<T extends ToolId>(toolId: T, input: ToolInput<T>): Promise<ToolOutput<T>>

  // Prompts — fire-and-forget, events arrive via the event stream
  sendPrompt(params: SendPromptParams): Promise<{ promptId: string }>
  approveToolCall(promptId: string, toolCallId: string): Promise<void>
  rejectToolCall(promptId: string, toolCallId: string, reason?: string): Promise<void>

  // Event stream — single persistent SSE connection
  get events(): EventStream
  connect(): void
  disconnect(): void
}
```

There are no hand-written per-resource methods (no `createConversation`, `listConversations`, etc.). All resource interactions — conversations, triggers, anything — go through `invokeTool()` with generated types. The client is thin: `fetch()` for REST calls, a single SSE connection for events.

### Typed Tool Invocations

The `GET /api/tools` endpoint returns the full list of exposed tools with JSON Schema for each tool's input and output:

```json
{
  "tools": [
    {
      "id": "conversation.create",
      "description": "Create a new conversation",
      "tag": "Conversations",
      "input": { "type": "object", "properties": {} },
      "output": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }
    }
  ]
}
```

A build-time code generation step reads this schema and produces strongly-typed helpers:

```typescript
// generated/tools.ts (auto-generated, committed)

// Union of all tool IDs
type ToolId = 'conversation.create' | 'conversation.list' | 'conversation.get' | 'trigger.create' | ...;

// Per-tool input/output type maps
type ToolInput<T extends ToolId> =
  T extends 'conversation.create' ? Record<string, never> :
  T extends 'conversation.list' ? { limit?: number; offset?: number } :
  T extends 'conversation.get' ? { conversationId: string } :
  ...;

type ToolOutput<T extends ToolId> =
  T extends 'conversation.create' ? { id: string } :
  T extends 'conversation.list' ? { conversations: Array<{ id: string; createdAt: string; updatedAt: string }> } :
  ...;
```

Usage in the app:

```typescript
// Fully typed — TS knows the input shape and return type
const { id } = await client.invokeTool('conversation.create', {});
const { conversations } = await client.invokeTool('conversation.list', { limit: 20 });
const conv = await client.invokeTool('conversation.get', { conversationId: id });
```

The code generator is a small script (`scripts/generate-tool-types.ts`) that:
1. Fetches `GET /api/tools` from a running server (or reads a saved JSON snapshot)
2. Converts JSON Schema input/output to TypeScript types (via `json-schema-to-typescript` or similar)
3. Emits the `ToolId` union, `ToolInput<T>`, and `ToolOutput<T>` conditional type maps
4. Outputs to `src/generated/tools.ts`

This runs alongside the OpenAPI codegen during `pnpm --filter expo generate`.

### EventStream

The client maintains a single persistent SSE connection to `GET /api/events`. All prompt lifecycle events for the authenticated user arrive through this one connection.

```typescript
type EventStreamEvents = {
  'prompt.created': (data: { promptId: string }) => void;
  'prompt.output': (data: { promptId: string } & PromptOutput) => void;
  'prompt.approval': (data: { promptId: string; toolCallId: string; toolName: string; input: unknown; reason: string }) => void;
  'prompt.completed': (data: { promptId: string; usage: Usage }) => void;
  'prompt.error': (data: { promptId: string; message: string }) => void;
  'connected': () => void;
  'disconnected': (error?: Error) => void;
};

type EventStream = {
  on<E extends keyof EventStreamEvents>(event: E, handler: EventStreamEvents[E]): void;
  off<E extends keyof EventStreamEvents>(event: E, handler: EventStreamEvents[E]): void;
  readonly connected: boolean;
};
```

Every SSE event payload includes a `promptId`, so the UI layer can route events to the correct conversation/screen. Events from prompts triggered server-side (e.g., by cron triggers) are also delivered — the client can display notifications or update conversation lists in response.

The `connect()` method is called once when the app starts (or when settings change). `disconnect()` is called on app teardown. Reconnection on network recovery is automatic with exponential backoff.

### SSE Platform Abstraction

The event stream endpoint uses `GET` with an `X-User-Id` header. Platform-specific files handle the SSE transport:

- **`client.sse.web.ts`** — Uses `fetch()` with a `ReadableStream` reader and `eventsource-parser` to parse the SSE text protocol. (The browser's native `EventSource` does not support custom headers.)
- **`client.sse.native.ts`** — Uses `react-native-sse` which supports custom headers natively.

Both implement the same interface:

```typescript
type SseConnection = {
  addEventListener(event: string, handler: (event: { data: string }) => void): void;
  removeEventListener(event: string, handler: (event: { data: string }) => void): void;
  close(): void;
};

type CreateSseConnection = (url: string, options: {
  headers: Record<string, string>;
}) => SseConnection;
```

Since the event stream is `GET` (not `POST`), both platforms can use standard SSE semantics. The `POST`-with-SSE-response complexity from the original spec 010 design is eliminated.

## Code Generation

There are two code generation steps, both run via `pnpm --filter expo generate`:

### 1. OpenAPI Codegen (REST endpoints)

Generates types for the fixed REST surface — capabilities, prompt submission, approve/reject, event stream types.

```typescript
// apps/expo/openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'http://localhost:3000/api/docs/json', // OpenAPI spec from running server
  output: 'src/generated/api',
  plugins: [
    '@hey-api/typescript',      // TypeScript types
    '@hey-api/sdk',             // Fetch-based SDK functions
    'zod',                      // Zod schemas for runtime validation
  ],
});
```

### 2. Tool Schema Codegen (typed tool invocations)

A custom script (`scripts/generate-tool-types.ts`) fetches `GET /api/tools`, reads the JSON Schema for each tool's input and output, and emits:
- `ToolId` — union of all tool IDs
- `ToolInput<T>` — conditional type mapping tool ID → input type
- `ToolOutput<T>` — conditional type mapping tool ID → output type
- Per-tool Zod schemas for optional runtime validation

The script uses `json-schema-to-typescript` (or similar) to convert JSON Schema → TypeScript types.

```bash
# Fetch tool schemas from running server and generate types
ts-node scripts/generate-tool-types.ts --server http://localhost:3000 --output src/generated/tools.ts
```

Alternatively, the script can read from a saved JSON snapshot (`tools.snapshot.json`) so the app builds without a running server.

### Workflow

1. Start the API server locally
2. Run `pnpm --filter expo generate` (runs both codegen steps)
3. Generated files land in `src/generated/api/` and `src/generated/tools.ts`
4. Commit the generated output — the API changes infrequently, and committed output means the app builds without a running server

## React Integration

### Client Provider

```typescript
// hooks/use-client.ts
const AgenticClientContext = createContext<AgenticClient | null>(null);

const AgenticClientProvider = ({ client, children }: {
  client: AgenticClient;
  children: ReactNode;
}) => (
  <AgenticClientContext.Provider value={client}>
    {children}
  </AgenticClientContext.Provider>
);

const useAgenticClient = (): AgenticClient => {
  const client = useContext(AgenticClientContext);
  if (!client) throw new Error('useAgenticClient must be used within AgenticClientProvider');
  return client;
};
```

### Event Stream Hook

Manages the persistent SSE connection lifecycle. Called once in the root layout:

```typescript
// hooks/use-event-stream.ts
const useEventStream = () => {
  const client = useAgenticClient();

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  return client.events;
};
```

The root layout calls `useEventStream()` so the connection is open for the entire app session. Individual screens subscribe to specific prompt IDs via the prompt hook.

### Prompt Hook

Subscribes to events for a specific prompt via the shared event stream:

```typescript
type UsePromptReturn = {
  send: (input: string, options?: { conversationId?: string; model?: 'normal' | 'high' }) => void;
  promptId: string | null;
  outputs: PromptOutput[];
  pendingApproval: ApprovalRequest | null;
  isStreaming: boolean;
  error: Error | null;
  approve: (toolCallId: string) => Promise<void>;
  reject: (toolCallId: string, reason?: string) => Promise<void>;
};

const usePrompt = (): UsePromptReturn;
```

This hook:
1. Calls `client.sendPrompt()` on `send()`, receives `{ promptId }` back
2. Subscribes to `client.events` and filters events by `promptId`
3. Accumulates `prompt.output` events into the `outputs` array
4. Surfaces `prompt.approval` events as `pendingApproval`
5. Calls `client.approveToolCall()` / `rejectToolCall()` on `approve()` / `reject()`
6. Sets `isStreaming = false` on `prompt.completed` or `prompt.error`

Because the event stream is global, a prompt started in one screen can be observed in another — for example, the conversation list can update its "last active" timestamp when a prompt completes in the chat screen.

### Tool Invocation Hook

A thin wrapper around `client.invokeTool()` using TanStack Query mutations:

```typescript
const useToolInvoke = <T extends ToolId>(toolId: T) => {
  const client = useAgenticClient();
  return useMutation({
    mutationFn: (input: ToolInput<T>) => client.invokeTool(toolId, input),
  });
};

// Usage
const createConversation = useToolInvoke('conversation.create');
const result = await createConversation.mutateAsync({});
```

For queries (list conversations, get conversation), use TanStack Query's `useQuery`:

```typescript
const useToolQuery = <T extends ToolId>(toolId: T, input: ToolInput<T>) => {
  const client = useAgenticClient();
  return useQuery({
    queryKey: ['tool', toolId, input],
    queryFn: () => client.invokeTool(toolId, input),
  });
};

// Usage
const { data } = useToolQuery('conversation.list', { limit: 20 });
```

## UI Components

### Design System (Tamagui)

The Tamagui config defines:
- **Tokens**: spacing, sizes, radii, z-indices
- **Themes**: light and dark, following system preference by default
- **Fonts**: Inter for body, monospace for code blocks
- **Media queries**: for responsive layout (compact mobile vs. wider tablet/web)

### Screen Breakdown

#### Conversations Tab (`(tabs)/index.tsx`)
- List of conversations sorted by `updatedAt`
- Pull-to-refresh via TanStack Query's `refetch`
- FAB or header button to create a new conversation
- Tapping a conversation navigates to `conversation/[id]`

#### Chat Screen (`conversation/[id].tsx`)
- Message list showing prompt inputs and AI outputs
- Rehydrates from `conversation.get` on mount (TanStack Query)
- New messages arrive via SSE and append to the list
- Tool call outputs rendered as collapsible cards (tool name, input, result)
- Approval requests rendered inline with approve/reject buttons
- Text input bar at bottom with send button
- Model selector (normal/high) as a discrete toggle

#### Settings (`(tabs)/settings.tsx`)
- Server URL input (persisted to AsyncStorage)
- User ID input (persisted to AsyncStorage)
- Theme toggle (system / light / dark)
- Event stream connection status (connected / reconnecting / disconnected)

### Component Library

Key shared components (all built with Tamagui):

| Component | Description |
|-----------|-------------|
| `ChatMessage` | Renders a single prompt input or AI output |
| `ToolCallCard` | Collapsible card for a tool invocation (name, input, result) |
| `ApprovalBanner` | Inline approval request with approve/reject buttons |
| `MarkdownView` | Cross-platform markdown renderer for AI text |
| `StreamingIndicator` | Animated indicator while SSE stream is active |
| `ConnectionStatus` | Shows event stream connection state (connected/reconnecting/disconnected) |

### Markdown Rendering

AI text responses contain markdown. Use `react-native-markdown-display` (or a Tamagui-compatible alternative) with custom renderers that map to Tamagui components for consistent styling. Code blocks use a monospace font with syntax highlighting via a lightweight highlighter.

## Storybook

### Configuration

```typescript
// apps/expo/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-native-web-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-native-web-vite',
  stories: ['../src/components/**/*.stories.tsx'],
};

export default config;
```

### Approach

- Stories live alongside components: `ChatMessage.stories.tsx` next to `ChatMessage.tsx`
- Stories render in the browser via `react-native-web` — no device needed for UI iteration
- Tamagui provider is added as a Storybook decorator for theme/token access
- Mock data fixtures for tool schemas, SSE events, and conversation history

### Scripts

```json
{
  "storybook": "storybook dev -p 6006",
  "storybook:build": "storybook build"
}
```

## Error Handling

| Scenario | Client Behavior |
|----------|-----------------|
| Network unreachable | TanStack Query retry with exponential backoff; event stream enters reconnecting state |
| Event stream disconnects | Auto-reconnect with exponential backoff; `ConnectionStatus` component shows reconnecting state. On reconnect, the client re-fetches active conversation to catch any missed events. |
| API returns `401 AUTH_REQUIRED` | Redirect to settings screen to configure user ID |
| API returns `422 FEATURE_UNAVAILABLE` | Disable conversation features, show single-turn mode |
| API returns `422 VALIDATION_ERROR` | Display validation errors inline on the form |
| API returns `404 TOOL_NOT_FOUND` | Remove tool from cache, show "tool no longer available" |
| API returns `502 MODEL_ERROR` | Display "AI service unavailable" with retry |

## Configuration

### Build-Time

| Setting | Source | Description |
|---------|--------|-------------|
| `EXPO_PUBLIC_API_URL` | `.env` | Default API base URL (can be overridden at runtime in settings) |
| `EXPO_PUBLIC_DEFAULT_USER` | `.env` | Default user ID for development |

### Runtime (AsyncStorage)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `serverUrl` | string | `EXPO_PUBLIC_API_URL` | API base URL |
| `userId` | string | `EXPO_PUBLIC_DEFAULT_USER` | User identifier sent as `X-User-Id` |
| `theme` | `'system' \| 'light' \| 'dark'` | `'system'` | Color scheme preference |

## External Dependencies

| Package | Purpose |
|---------|---------|
| `expo` | Framework, Metro bundler, Expo Router |
| `expo-router` | File-based routing |
| `tamagui`, `@tamagui/config` | UI component library and design tokens |
| `@tamagui/babel-plugin` | Compile-time style extraction |
| `@tanstack/react-query` | Server state management |
| `react-native-sse` | SSE support on native (iOS/Android) |
| `@react-native-async-storage/async-storage` | Persistent settings storage |
| `eventsource-parser` | SSE text protocol parser for web fetch-based implementation |
| `react-native-markdown-display` | Markdown rendering (or equivalent) |
| `json-schema-to-typescript` | Converts tool JSON Schemas to TypeScript types (dev dependency) |
| `@hey-api/openapi-ts` | Code generation from OpenAPI spec for REST endpoints (dev dependency) |
| `@storybook/react-native-web-vite` | Storybook framework (dev dependency) |

## API Changes (Spec 010 Amendment)

This spec requires two changes to the API service defined in spec 010:

### 1. New endpoint: `GET /api/events` (user-scoped SSE subscription)

A persistent SSE connection that streams all prompt lifecycle events for the authenticated user.

```
GET /api/events
X-User-Id: alice
Accept: text/event-stream
```

Response: `200` with `Content-Type: text/event-stream`.

Every event payload includes a `promptId` field so the client can route events to the correct UI context:

```
event: prompt.created
data: {"promptId":"p-123"}

event: prompt.output
data: {"promptId":"p-123","type":"tool","id":"call-1","function":"time.now","input":{},"result":{"type":"success","output":{"time":"..."}},"start":"...","end":"..."}

event: prompt.output
data: {"promptId":"p-123","type":"text","content":"The current time is 10:00 AM.","start":"...","end":"..."}

event: prompt.completed
data: {"promptId":"p-123","usage":{"inputTokens":150,"outputTokens":42,"totalTokens":192}}
```

The event stream delivers events for **all prompts** belonging to the user — including prompts triggered server-side by cron triggers or other plugins. This allows the client to react globally (e.g., update a conversation list, show a notification badge).

The event types are identical to the existing SSE events from spec 010 (`prompt.created`, `prompt.output`, `prompt.approval`, `prompt.completed`, `error`), just delivered through a shared connection instead of a per-prompt stream.

**Implementation**: The API service maintains a map of `userId → Set<SSEResponse>`. When a `PromptCompletion` emits events, the API looks up the user's active SSE connections and writes to all of them. Multiple connections per user are supported (e.g., phone + web).

**Keep-alive**: The server sends a `:keepalive` comment every 30 seconds to prevent proxies and mobile OS network managers from closing idle connections.

### 2. Changed endpoint: `POST /api/prompt` (no longer SSE)

`POST /api/prompt` becomes a plain JSON endpoint that creates the prompt and returns immediately:

```
POST /api/prompt
Content-Type: application/json
X-User-Id: alice

{ "input": "What time is it?", "model": "normal", "conversationId": "conv-abc" }
```

Response `200`:
```json
{ "promptId": "p-123" }
```

The agent loop runs asynchronously. Prompt lifecycle events are delivered via the `GET /api/events` SSE connection. The client matches events to prompts by `promptId`.

This decoupling has several benefits:
- **One connection**: The client maintains a single SSE connection regardless of how many prompts are in flight
- **Cross-prompt visibility**: The client sees events from server-initiated prompts (triggers, background tasks) without polling
- **Simpler mobile lifecycle**: One connection to manage for reconnection, rather than N per active prompt
- **Multi-window**: Multiple clients for the same user each get their own event stream — all stay in sync

The `POST /api/prompts/:promptId/approve` and `POST /api/prompts/:promptId/reject` endpoints remain unchanged.

## Boundary

### This app owns

- All client-side UI, navigation, and state
- API client class and SSE transport abstraction
- Code generation config and generated output
- Tamagui theme and design tokens
- Storybook configuration and component stories

### Other packages handle

- **api** (spec 010): HTTP server, SSE protocol, tool exposure, OpenAPI spec generation
- **conversation**: Conversation persistence, history — accessed via API tools
- **core**: Agent loop, tool execution, prompt completion — all server-side
- **server**: Plugin composition, configuration — the client connects to a running server

## Future Work

- **Push notifications**: Subscribe to trigger events and conversation updates via push (requires server-side notification delivery)
- **Offline mode**: Cache conversations and tool results locally, sync when reconnected
- **Token-level streaming**: When the API supports partial text streaming, update the chat UI to render tokens as they arrive
- **File handling**: Display file outputs inline, support file upload as tool input
- **Tool browser**: Searchable tool list with schema inspection and direct "try it" invocation forms
- **Trigger management**: CRUD screens for scheduled triggers
- **Split packages**: If the component library or API client grows, extract into `packages/client-ui` and `packages/client-api`
- **Authentication**: Proper auth flow when the API gains OAuth/JWT support
- **E2E testing**: Detox or Maestro for automated UI testing on device
