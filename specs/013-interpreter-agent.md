# 013: Interpreter Agent

**Status**: Draft

## Overview

Replace the traditional tool-calling agent loop with a code-execution loop. Instead of the model emitting structured tool calls, it writes JavaScript that runs in the existing QuickJS sandbox (`InterpreterService`). Tools are exposed as async functions the code can call directly. Text output to the user is also a function call, enabling streaming mid-execution.

This approach lets the model:

- Batch and loop over tool calls without round-trips
- Use variables, control flow, and utility functions for complex reasoning
- Keep intermediate data in script-local variables instead of the context window
- Compose tool results programmatically before responding

## Scope

**In scope (v1)**

- Extend `@morten-olsen/agentic-interpreter` with the agent loop, runtime helpers, conversation database, system prompt, and CLI
- Reuse `CompletionService` (extended to accept a message history) for LLM calls
- Register the same plugins as the server to get the full tool surface
- Single-user CLI for interactive multi-turn sessions

**Out of scope**

- HTTP server / playground UI integration (future spec)
- Streaming partial code tokens to the user
- Approval flow for dangerous tools (all tools auto-approved in v1)
- Parallel code execution

## Data Model

### Conversation Database

Database ID: `interpreter-agent`

| Table | Columns | Purpose |
|-------|---------|---------|
| `interpreter_agent_conversations` | `id` PK, `title` nullable, `created_at`, `updated_at` | Conversation metadata |
| `interpreter_agent_turns` | `id` PK, `conversation_id` FK, `role` (`user` \| `assistant`), `content` text, `created_at` | Ordered message history |

`role=user` stores the user's natural-language message. `role=assistant` stores the raw code the model produced. Tool results and `output()` calls are ephemeral within the execution — only the code itself is persisted, keeping the history compact.

### Turn-Local Store

A plain `Map<string, unknown>` scoped to a single agent turn (one user message → done). Exposed to the sandbox as `store(key, value)` and `recall(key)`. Cleared when `done()` is called or max iterations are reached. Not persisted.

## Agent Loop

```
User message
  │
  ▼
┌─────────────────────────────────────────┐
│ Build messages:                         │
│   system prompt                         │
│   + conversation history (from DB)      │
│   + user message                        │
│   + [iteration outputs from this turn]  │
└────────────────┬────────────────────────┘
                 │
                 ▼
          ┌─────────────┐
          │  LLM call    │  (CompletionService, code-only output)
          └──────┬──────┘
                 │
                 ▼
         ┌───────────────┐
         │ Execute code   │  (InterpreterService)
         │ in QuickJS     │
         └──────┬────────┘
                │
        ┌───────┴────────┐
        │                │
   done() called    code finished
   or error         without done()
        │                │
        ▼                ▼
     Return         Capture return value
     to user        as iteration output,
                    loop back to LLM
                    (up to maxIterations)
```

### Iteration Model

Each LLM call produces one code block. After execution:

1. If `done()` was called during execution → turn ends, all `output()` text has already been streamed.
2. If the code returns a value without calling `done()` → the return value is serialised and appended to the messages as a `system` message (`"Execution result: …"`), and the loop continues.
3. If execution throws → the error message is appended as a `system` message (`"Execution error: …"`), and the loop continues so the model can recover.
4. If `maxIterations` is reached → turn ends with a system-generated message to the user.

## API / Service Layer

### `CompletionService` Extension

Add an overload that accepts an explicit message array:

```typescript
type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CompletionMessagesInput = {
  messages: ChatMessage[];
  maxTokens?: number;
};

// New method alongside the existing complete()
public completeMessages = async (input: CompletionMessagesInput): Promise<string | null>
```

This keeps the existing `complete()` API unchanged.

### `InterpreterAgentService`

New service in `@morten-olsen/agentic-interpreter`. Orchestrates the loop.

```typescript
type InterpreterAgentOptions = {
  services: Services;
  conversationId?: string;    // Resume or start new
  maxIterations?: number;     // Default 10
  onOutput?: (text: string) => void;  // Streaming text callback
};

class InterpreterAgentService {
  constructor(options: InterpreterAgentOptions);

  // Run one user turn: send message, loop until done
  public run(userMessage: string): Promise<{ conversationId: string }>;
}
```

Internally:

1. Loads or creates conversation from DB
2. Appends user message to DB
3. Builds the full message array (system + history + user + iteration outputs)
4. Calls `CompletionService.completeMessages()` to get code
5. Appends assistant message (code) to DB
6. Sets up a fresh `InterpreterService` instance with exposed functions
7. Executes the code
8. Loops or exits based on the iteration model above

### Tool Discovery & Exposure

Before each turn, the service runs the same plugin `prepare()` cycle used by the standard agent loop:

1. Create a `PluginPrepareContext` with the conversation's prompts/state
2. Call `prepare()` on all registered plugins → collects tools and context
3. For each tool, expose a function to the sandbox:

```javascript
// In the sandbox, the agent can call:
const types = await connectionTypes();
const result = await calendarSync({ connectionId: "abc" });
```

Function names are derived from tool IDs: `trigger.create` → `triggerCreate` (camelCase). If a collision occurs, the full dotted name is also registered.

Tool input is the raw JS object — no JSON serialisation needed since we're in the same runtime.

### Exposed Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `output` | `output(text: string): void` | Stream text to the user. Can be called multiple times. |
| `done` | `done(): void` | Signal that the turn is complete. Must be called to end the turn. |
| `discoverTools` | `discoverTools(): Array<{ id, name, description }>` | List all available tools. |
| `toolSchema` | `toolSchema(toolId: string): object` | Get the JSON Schema for a tool's input. |
| `store` | `store(key: string, value: any): void` | Persist a value for the duration of this turn (survives iterations). |
| `recall` | `recall(key: string): any` | Retrieve a previously stored value. Returns `undefined` if not set. |
| `log` | `log(...args: any[]): void` | Capture data visible to the model in the next iteration's context (not shown to user). |
| **Tool functions** | `toolName(input): Promise<result>` | One function per registered tool. Async. Input/output are plain JS objects. |

### Context from Plugins

Context items collected during `prepare()` are included in the system prompt, just as they are in the standard agent loop. This gives the interpreter agent the same awareness of connections, behaviours, user preferences, etc.

## System Prompt

The system prompt instructs the model to output **only** valid JavaScript code — no markdown fences, no prose.

```
You are an agent that solves tasks by writing JavaScript code.

IMPORTANT RULES:
- Your entire response must be valid JavaScript. No markdown, no backticks, no explanation text.
- You have access to async functions. Use `await` at the top level.
- Call `output("text")` to send text to the user. This is the ONLY way to communicate.
- Call `done()` when you are finished. If you don't call done(), your code's return value
  will be shown to you and you can continue in the next iteration.
- Use `store(key, value)` and `recall(key)` to keep data across iterations within a turn.
- Use `log(data)` to capture data for yourself without showing it to the user.
- Use `discoverTools()` to see all available tools and `toolSchema(id)` for input details.
- You can write helper functions, use loops, try/catch, and any JavaScript features.
- When fetching data, batch calls and process results in code rather than making one call per iteration.

AVAILABLE TOOLS:
{tool_list}

CONTEXT:
{context_items}
```

`{tool_list}` is a formatted summary of each tool: ID, camelCase function name, and description.
`{context_items}` is the joined context from plugin `prepare()`.

## CLI

A new CLI entry point in the interpreter package, similar to the playground CLI pattern.

### Usage

```bash
# Start a new conversation
pnpm --filter @morten-olsen/agentic-interpreter cli "What connections do I have?"

# Continue an existing conversation
pnpm --filter @morten-olsen/agentic-interpreter cli "Tell me more" -c <conversation-id>

# Non-interactive single turn
pnpm --filter @morten-olsen/agentic-interpreter cli "Summarise my calendar for today"
```

### Configuration

Same environment variables as the playground CLI:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | LLM provider API key |
| `OPENAI_BASE_URL` | No | OpenAI default | LLM provider base URL |

The CLI creates a local `Services` container, registers all plugins (same set as the server), and runs the agent loop locally.

### Output

- `output()` calls are printed to stdout immediately as they occur
- Iteration logs (from `log()`) are printed to stderr with a prefix for debugging
- The conversation ID is printed to stderr at the start so it can be resumed

### Interactive Mode

When run without a message argument, the CLI enters a REPL loop:

```bash
pnpm --filter @morten-olsen/agentic-interpreter cli
# > What tools do you have?
# (agent output streams here)
# > Which vessels are in the North Atlantic?
# (agent writes code to batch-fetch vessel locations, filter by bounding box, respond)
# > /quit
```

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| Code syntax error | Error message fed back to model as iteration output |
| Runtime exception | Error message + stack trace fed back to model |
| Tool invocation error | Error returned from the function (model can try/catch) |
| `maxIterations` reached | Turn ends, user sees "Max iterations reached" message |
| LLM returns non-code | Attempt to execute anyway; syntax error path handles it |
| LLM API failure | Turn ends with error, conversation preserved for retry |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `maxIterations` | `10` | Maximum LLM→execute cycles per user turn |
| `maxTokens` | `4096` | Max tokens for LLM code generation |
| `model` | `models.normal` | Which model config to use |

## Boundary

**This package owns:**

- The interpreter agent loop (iterate until `done()`)
- Sandbox function exposure (tools as functions, `output`, `done`, `store`, `recall`, `log`, `discoverTools`, `toolSchema`)
- Conversation persistence for the interpreter agent
- System prompt for code-only output
- CLI entry point

**Other packages handle:**

- `core` — `CompletionService` (extended), `PluginService`, `Services` DI
- `interpreter` (existing) — `InterpreterService` QuickJS execution engine
- Individual plugins — Tool definitions, `prepare()` hooks, context items
- `database` — Kysely/SQLite infrastructure

## File Organization

```
packages/interpreter/
└── src/
    ├── agent/
    │   ├── agent.ts              InterpreterAgentService
    │   ├── agent.prompt.ts       System prompt builder
    │   ├── agent.functions.ts    Exposed function setup (output, done, store, etc.)
    │   └── agent.database.ts     Conversation database definition
    ├── cli/
    │   ├── cli.ts                Entry point (arg parsing, dispatch)
    │   └── cli.setup.ts          Services + plugin registration
    ├── plugin/
    │   └── plugin.ts             Existing interpreter plugin
    ├── service/
    │   └── service.ts            Existing InterpreterService
    ├── schemas/
    │   └── schemas.ts            Existing schemas
    └── exports.ts                Updated to also export agent types
```

## Open Questions

1. **Tool name collisions** — If two tools produce the same camelCase name, the fallback is the dotted ID. Should we expose both always, or only on collision?
2. **Streaming granularity** — Should `output()` calls flush immediately, or should we buffer until the code block finishes? (v1: flush immediately)
3. **Code in history** — Storing raw code in the history works but uses tokens. Should we summarise old turns after N messages? (v1: no, keep it simple)
