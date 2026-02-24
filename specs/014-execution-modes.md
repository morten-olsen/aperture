# 014: Execution Modes

**Status**: Draft

## Overview

Introduce a pluggable execution mode system that decouples *how* prompts are executed from *how* they are managed. Today, `PromptCompletion` is the only agent loop: it calls the LLM, processes structured tool calls, and loops. Spec 013 introduced an alternative where the LLM writes JavaScript code executed in a QuickJS sandbox. Rather than maintaining two independent systems, this spec unifies them behind a shared interface.

Plugins can register new execution modes via an `ExecutionModeService`. The Prompt object gains a `mode` field so that `PromptService` delegates to the correct executor. Both modes record their activity in the same `Prompt.output` array (tool outputs, text outputs, file outputs), making them transparent to the conversation layer, API, events, and UI.

This also means the interpreter package no longer needs its own CLI or conversation database — it participates in the standard prompt/conversation flow.

## Scope

**In scope**

- `PromptExecutor` interface — shared contract for all execution modes
- `ExecutionModeService` — registry in `core` for execution mode factories
- `ClassicMode` — wraps existing `PromptCompletion` behind the new interface
- `CodeMode` — wraps the interpreter agent behind the new interface
- `mode` field on the `Prompt` schema
- Updates to `PromptService` to dispatch by mode
- Updates to `ConversationInstance` and API routes to accept `mode`
- Remove interpreter CLI and conversation database (use standard system)

**Out of scope**

- Per-conversation mode switching mid-conversation (mode is set per prompt)
- Mode-specific UI rendering (UI treats all outputs the same for now)
- Mode-specific configuration schemas (future spec)
- Approval flow for code mode (code mode auto-approves tools, same as spec 013 v1)

## Data Model

### Prompt Schema Change

Add a `mode` field to the prompt schema:

```typescript
const promptSchema = z.object({
  id: z.string(),
  userId: z.string(),
  model: z.enum(['normal', 'high']),
  mode: z.string().default('classic'),   // ← new
  visible: z.boolean().default(true),
  state: z.enum(['running', 'completed', 'waiting_for_approval']),
  input: z.string().optional(),
  output: z.array(promptOutputSchema),
  usage: promptUsageSchema.optional(),
});
```

The `mode` field is a free-form string so that any plugin can register a mode without modifying the core enum. Default is `'classic'`.

### Code Mode Output Mapping

The code executor maps its activity onto the existing `PromptOutput` types:

| Code mode event | Prompt output type | Details |
|---|---|---|
| LLM generates code | `tool` | `function: "code.execute"`, `input: { code: "..." }`, `result: { type: "success", output: <return value> }` or `{ type: "error", error: "..." }` |
| `output("text")` call | `text` | `content: "text"` |
| Tool call within code (e.g. `triggerCreate(...)`) | `tool` | Same shape as classic tool outputs — `function: "trigger.create"`, `input: {...}`, `result: {...}` |
| File output from tool | `file` | Same as classic |

This gives full observability: the UI can display the generated code, individual tool invocations, and user-facing text in a single timeline.

### Removed: Interpreter Conversation Database

The `interpreter-agent` database (tables `interpreter_agent_conversations` and `interpreter_agent_turns`) is removed. Conversation history is managed by the standard `ConversationService` / `ConversationInstance` system.

## API / Service Layer

### `PromptExecutor` Interface

New type in `core/src/prompt/`. This is the contract all execution modes implement.

```typescript
type PromptExecutor = {
  readonly prompt: Prompt;
  readonly id: string;
  readonly userId: string;
  readonly state: State;
  readonly usage: PromptUsage;

  run(): Promise<Prompt>;
  approve?(toolCallId: string): Promise<void>;
  reject?(toolCallId: string, reason?: string): Promise<void>;
};
```

`PromptCompletion` already satisfies this interface — the change is exporting the type and making it explicit.

### `ExecutionMode` Type

A factory that creates executors. Registered in the mode service.

```typescript
type ExecutionModeFactory = {
  id: string;
  name: string;
  createExecutor(options: ExecutorCreateOptions): PromptExecutor;
};

type ExecutorCreateOptions = {
  services: Services;
  userId: string;
  history?: Prompt[];
  input?: string;
  state?: Record<string, unknown>;
  model?: 'normal' | 'high';
  maxRounds?: number;
  resumePrompt?: Prompt;
};
```

`ExecutorCreateOptions` matches the existing `PromptCompletionOptions` so that `PromptCompletion` can be wrapped without changes.

### `ExecutionModeService`

New service in `core/src/prompt/`. Manages the mode registry.

```typescript
class ExecutionModeService {
  #modes = new Map<string, ExecutionModeFactory>();

  public register = (mode: ExecutionModeFactory): void => {
    this.#modes.set(mode.id, mode);
  };

  public get = (modeId: string): ExecutionModeFactory | undefined => {
    return this.#modes.get(modeId);
  };

  public list = (): ExecutionModeFactory[] => {
    return [...this.#modes.values()];
  };
}
```

This is a plain service (not a singleton requiring `Services` in constructor) registered in the DI container.

### `PromptService` Changes

`PromptService.create()` gains a `mode` parameter:

```typescript
type PromptCompletionInput = {
  userId: string;
  input?: string;
  model?: 'normal' | 'high';
  mode?: string;                // ← new, defaults to 'classic'
  history?: Prompt[];
  state?: Record<string, unknown>;
  maxRounds?: number;
  resumePrompt?: Prompt;
};
```

Internally, `create()` looks up the mode and delegates:

```typescript
public create = (options: PromptCompletionInput): PromptExecutor => {
  const modeId = options.mode ?? 'classic';
  const modeService = this.#services.get(ExecutionModeService);
  const mode = modeService.get(modeId);

  if (!mode) {
    throw new Error(`Unknown execution mode: "${modeId}"`);
  }

  const executor = mode.createExecutor({ ...options, services: this.#services });
  this.#active.set(executor.id, executor);

  const eventService = this.#services.get(EventService);
  eventService.publish(
    promptCreatedEvent,
    { promptId: executor.id, userId: executor.userId },
    { userId: executor.userId },
  );

  return executor;
};
```

The `#active` map changes from `Map<string, PromptCompletion>` to `Map<string, PromptExecutor>`.

### Classic Mode Registration

The classic mode wraps `PromptCompletion`. It is registered by `PromptService` during construction so it's always available:

```typescript
constructor(services: Services) {
  this.#services = services;
  // ... event setup ...

  const modeService = services.get(ExecutionModeService);
  modeService.register({
    id: 'classic',
    name: 'Classic (text + tools)',
    createExecutor: (options) => new PromptCompletion(options),
  });
}
```

### Code Mode Registration

The interpreter plugin registers the code mode during its `setup()` hook:

```typescript
const interpreterPlugin: Plugin = {
  id: 'interpreter',
  // ...
  setup: async ({ services }) => {
    const modeService = services.get(ExecutionModeService);
    modeService.register({
      id: 'code',
      name: 'Code (JavaScript sandbox)',
      createExecutor: (options) => new CodeExecutor(options),
    });
  },
};
```

### `CodeExecutor`

New class in `interpreter/src/mode/`. Implements `PromptExecutor`.

```typescript
class CodeExecutor implements PromptExecutor {
  #prompt: Prompt;
  #state: State;
  #usage: PromptUsage;
  // ...

  public run = async (): Promise<Prompt> => {
    const prepared = await this.#prepare();  // Plugin prepare cycle
    const systemPrompt = buildSystemPrompt({ tools: prepared.tools, context: prepared.context });

    const store = new Map<string, unknown>();

    for (let iteration = 0; iteration < this.#maxRounds; iteration++) {
      // Build messages from history + current prompt outputs
      const messages = this.#buildMessages(systemPrompt, prepared);

      // LLM call → code string
      const code = await this.#callModel(messages);
      if (!code) break;

      // Record code as tool output (pending result)
      const codeOutput: PromptOutputTool = {
        type: 'tool',
        id: randomUUID(),
        function: 'code.execute',
        input: { code },
        result: { type: 'pending', reason: 'Executing...' },
        start: new Date().toISOString(),
      };
      this.#prompt.output.push(codeOutput);
      this.#publishOutput(codeOutput);

      // Execute in sandbox
      const interpreter = new InterpreterService();
      const controls = setupAgentFunctions({
        interpreter, tools: prepared.tools, userId: this.userId,
        state: prepared.state, services: this.#services, store,
        onOutput: (text) => this.#addTextOutput(text),
        onToolCall: (toolOutput) => this.#addToolOutput(toolOutput),
      });

      let result: unknown;
      let error: unknown;
      try {
        result = await interpreter.execute({ code });
      } catch (e) {
        error = e;
      }

      // Update code output with result
      codeOutput.result = error
        ? { type: 'error', error: error instanceof Error ? error.message : String(error) }
        : { type: 'success', output: result };
      codeOutput.end = new Date().toISOString();

      if (controls.isDone()) break;
    }

    this.#prompt.state = 'completed';
    this.#prompt.usage = this.#usage;
    // Publish completed event
    return this.#prompt;
  };
}
```

Key difference from `InterpreterAgentService`: the `CodeExecutor` writes to `Prompt.output` instead of a separate database. History comes from `options.history` (previous prompts), and current-turn iteration context comes from `this.#prompt.output`.

### Message Building for Code Mode

The `#buildMessages` method converts prompt history into the message format expected by the code LLM:

```
[system prompt]
[for each previous prompt in history:]
  [user message → role: "user"]
  [tool outputs → role: "assistant" (the code), then role: "user" (execution feedback)]
  [text outputs → role: "assistant"]
[for current prompt:]
  [user message → role: "user"]
  [iteration outputs from this turn]
```

Previous prompts in `classic` mode also work — tool outputs from classic mode become contextual information the code agent can reference.

### `setupAgentFunctions` Changes

Add an `onToolCall` callback so that individual tool invocations within the code sandbox are recorded as `PromptOutputTool` entries on the prompt:

```typescript
type SetupAgentFunctionsOptions = {
  // ... existing fields ...
  onToolCall?: (output: PromptOutputTool) => void;
};
```

When a tool is invoked from the sandbox, before returning the result, the function setup creates a `PromptOutputTool` entry and calls `onToolCall`. This gives the executor a hook to push it onto the prompt's output array and publish the event.

## Plugin Behavior

### Interpreter Plugin

The interpreter plugin (`packages/interpreter/src/plugin/plugin.ts`) is extended:

**`setup()`** — Registers the `'code'` execution mode with `ExecutionModeService`.

**`prepare()`** — Unchanged. Still contributes the `interpreter.run` tool (for classic mode to invoke code execution as a tool). The code execution mode itself doesn't go through `prepare()` tools — it *is* the executor.

This means both modes can coexist:
- In classic mode, the LLM can use the `interpreter.run` tool to run arbitrary code
- In code mode, the LLM *is* writing code as its primary interaction pattern

### Other Plugins

No changes needed. Plugins continue to register tools and context via `prepare()`. Both execution modes call the same `prepare()` cycle, so all tools and context are available regardless of mode.

## Consumer Changes

### ConversationInstance

`ConversationInstance.prompt()` accepts a `mode` parameter and passes it through:

```typescript
public prompt = async (input: Omit<PromptCompletionInput, 'userId'>) => {
  // ... existing logic ...
  const promptCompletion = promptService.create({
    ...input,        // mode is passed through if present
    userId,
    history: [...this.#prompts],
    state: { ...this.#state, ...input.state },
  });
  // ...
};
```

No other changes needed — `ConversationInstance` already works with the `Prompt` type.

### API Routes

`POST /prompt` body gains an optional `mode` field:

```typescript
app.post<{ Body: { input: string; model?: 'normal' | 'high'; mode?: string; conversationId?: string } }>(
  '/prompt',
  async (request) => {
    const { input, model, mode, conversationId } = request.body;
    // ... pass mode through to conversation.prompt() or promptService.create() ...
  },
);
```

`POST /prompts/:promptId/approve` and `POST /prompts/:promptId/reject` work unchanged — they call `executor.approve()` / `executor.reject()` on the active executor. Code mode v1 doesn't support approval (returns `undefined` for both), but the interface allows it for future versions.

### Events

No changes to event definitions. Both modes publish the same events:

- `prompt.created` — when executor is instantiated
- `prompt.output` — for each output added to the prompt
- `prompt.stream` — for streamed text deltas (classic mode uses this for LLM streaming; code mode can use it for `output()` calls)
- `prompt.completed` — when execution finishes
- `prompt.error` — on unrecoverable errors

### Playground CLI

The playground CLI can pass `mode` when creating prompts. No structural changes needed.

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| Unknown mode ID | `PromptService.create()` throws `Error("Unknown execution mode: ...")` |
| Mode plugin not loaded | Same as unknown mode — the mode isn't registered |
| Code syntax error | Recorded as `code.execute` tool result with `type: "error"`, model retries |
| Code runtime exception | Same as syntax error — error fed back to model |
| Tool error within code | Recorded as a separate tool output with `type: "error"` |
| LLM API failure | Executor catches, publishes `prompt.error` event |
| Max iterations reached | Prompt marked completed with a system text output |

## Configuration

| Option | Default | Scope | Description |
|--------|---------|-------|-------------|
| `mode` | `'classic'` | Per prompt | Which execution mode to use |
| `maxRounds` | `25` (classic) / `10` (code) | Per mode | Maximum LLM round-trips |

Mode-specific configuration (e.g. code mode's `evalType`) is handled internally by each mode. A future spec may introduce per-mode configuration schemas exposed through the `ExecutionModeFactory`.

## Boundary

**`core` owns:**

- `PromptExecutor` interface definition
- `ExecutionModeFactory` type
- `ExecutionModeService` (registry)
- `ClassicMode` registration (wraps `PromptCompletion`)
- `PromptService` mode dispatch
- `Prompt` schema with `mode` field
- All prompt events

**`interpreter` owns:**

- `CodeExecutor` (implements `PromptExecutor`)
- Code mode registration via plugin `setup()`
- System prompt builder for code-only output
- Sandbox function setup (`output`, `done`, `store`, `recall`, `log`, tool exposure)
- `InterpreterService` (QuickJS execution engine)

**`conversation` owns:**

- `ConversationInstance` — passes `mode` through, no mode-specific logic

**`api` owns:**

- API routes — passes `mode` through, no mode-specific logic

## File Organization

### New / Modified in `core`

```
packages/core/src/prompt/
├── prompt.completion.ts      Existing PromptCompletion (unchanged, now implements PromptExecutor)
├── prompt.executor.ts        NEW — PromptExecutor type, ExecutionModeFactory type
├── prompt.mode.ts            NEW — ExecutionModeService
├── prompt.schema.ts          MODIFIED — add mode field
├── prompt.service.ts         MODIFIED — dispatch by mode, register classic mode
├── prompt.events.ts          Unchanged
└── prompt.utils.ts           Unchanged
```

### Restructured in `interpreter`

```
packages/interpreter/src/
├── mode/
│   ├── mode.executor.ts      CodeExecutor class
│   ├── mode.prompt.ts        System prompt builder (moved from agent/)
│   └── mode.functions.ts     Sandbox function setup (moved from agent/, extended with onToolCall)
├── plugin/
│   └── plugin.ts             Extended — registers code mode in setup()
├── service/
│   └── service.ts            Unchanged InterpreterService
├── schemas/
│   └── schemas.ts            Unchanged
└── exports.ts                Updated exports
```

### Removed from `interpreter`

```
packages/interpreter/src/
├── agent/                    REMOVED — agent.ts, agent.database.ts, agent.prompt.ts, agent.functions.ts
└── cli/                      REMOVED — cli.ts, cli.config.ts, cli.setup.ts
```

Dependencies on `convict`, `dotenv`, and all plugin packages are removed from `interpreter`'s `package.json`.

## Migration

1. Add `mode` field to `Prompt` schema with default `'classic'` — fully backwards compatible
2. Extract `PromptExecutor` interface from `PromptCompletion`'s public API — no behaviour change
3. Create `ExecutionModeService`, register classic mode — `PromptService.create()` uses it but behaviour is identical
4. Implement `CodeExecutor` based on existing `InterpreterAgentService` logic
5. Register code mode in interpreter plugin's `setup()`
6. Remove interpreter CLI and conversation database
7. Update API routes and ConversationInstance to pass `mode` through

Each step is independently deployable. Steps 1–3 have zero behaviour change.

## Open Questions

1. **Mode in conversation vs. per-prompt** — Should a conversation have a default mode, or is it always specified per prompt? (v1: per-prompt, with default `'classic'`)
2. **Approval flow for code mode** — Code mode auto-approves all tools in v1. Should `requireApproval` be respected in a future version? How would the UI show pending approval mid-code-execution?
3. **Streaming in code mode** — Should `output()` calls publish `prompt.stream` events for real-time UI updates, or only `prompt.output` events after execution completes?
4. **Mixed-mode history** — When a conversation switches modes between prompts, the message building may need mode-aware conversion. Is this worth optimising in v1, or is a simple heuristic sufficient?
