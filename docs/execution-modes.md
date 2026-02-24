# Execution Modes

Execution modes control how the agent processes a prompt. The default **classic** mode uses the standard LLM text+tool-call loop. The **code** mode has the LLM write JavaScript that runs in a QuickJS sandbox. New modes can be registered by plugins.

## Built-in Modes

### Classic (`classic`)

The default mode. The LLM responds with text and structured tool calls. Tool calls are validated with Zod, executed, and the results are fed back for the next round. This is `PromptCompletion` in `core/src/prompt/prompt.completion.ts`.

### Code (`code`)

The LLM writes JavaScript code instead of making structured tool calls. Code runs in an isolated QuickJS sandbox via `InterpreterService`. Tools are exposed as synchronous functions the code can call directly.

Key characteristics:
- All tool functions appear synchronous from the sandbox (via `newAsyncifiedFunction`)
- `output(text)` sends text to the user (also emits `prompt.stream` events)
- `done()` signals the turn is complete
- `store(key, value)` / `recall(key)` persist data across iterations within a turn
- `log(...args)` captures debug output visible to the model on the next iteration
- `discoverTools()` and `toolSchema(toolId)` for runtime tool discovery

Requires the `interpreter` plugin to be registered.

## Using Modes

### API

Pass `mode` in the prompt request body:

```bash
# Classic mode (default)
curl -X POST http://localhost:4000/api/prompt \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: alice' \
  -d '{"input": "What tools do you have?"}'

# Code mode
curl -X POST http://localhost:4000/api/prompt \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: alice' \
  -d '{"input": "What is the weather?", "mode": "code"}'
```

### Playground CLI

Use the `-m` flag:

```bash
pnpm --filter @morten-olsen/agentic-playground cli prompt "What is the weather?" -m code
```

### Programmatic (ConversationInstance)

```typescript
const completion = await conversation.prompt({
  input: 'What is the weather?',
  mode: 'code',
});
await completion.run();
```

## How It Works

### Architecture

```
PromptService.create({ mode: 'code', ... })
  │
  ▼
ExecutionModeService.get('code')
  │
  ▼
ExecutionModeFactory.createExecutor(options)
  │
  ▼
CodeExecutor (implements PromptExecutor)
  │
  ▼
CodeExecutor.run()
  ├── prepare() → collect tools + context from plugins
  ├── build system prompt (code-only instructions + tool list)
  ├── loop:
  │   ├── LLM call → JavaScript code
  │   ├── execute in QuickJS sandbox
  │   ├── record outputs (tool calls, text, code.execute)
  │   └── if done() called → break, else feed result back
  └── mark prompt completed, publish events
```

### Output Mapping

Code mode maps its activity onto the standard `PromptOutput` types:

| Code mode event | Output type | Details |
|---|---|---|
| LLM generates code | `tool` | `function: "code.execute"`, `input: { code }`, result is execution return value or error |
| `output("text")` call | `text` | Appears as text content, also emits `prompt.stream` event |
| Tool call within code | `tool` | Standard tool output with function name, input, and result |
| File output from tool | `file` | Same as classic mode |

This means the UI, event system, and conversation history work identically regardless of mode.

### Events

Both modes emit the same events:

- `prompt.created` — executor instantiated
- `prompt.stream` — text deltas (classic: LLM streaming; code: `output()` calls)
- `prompt.output` — each output added to the prompt
- `prompt.completed` — execution finished
- `prompt.error` — unrecoverable error
- `prompt.approval-requested` — tool needs approval (classic mode only in v1)

## Adding a Custom Execution Mode

### 1. Implement `PromptExecutor`

```typescript
import type { PromptExecutor, ExecutorCreateOptions, Prompt, PromptUsage } from '@morten-olsen/agentic-core';
import { State } from '@morten-olsen/agentic-core';

class MyExecutor implements PromptExecutor {
  #prompt: Prompt;
  #state: State;
  #usage: PromptUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(options: ExecutorCreateOptions) {
    this.#prompt = options.resumePrompt ?? {
      id: crypto.randomUUID(),
      userId: options.userId,
      state: 'running',
      input: options.input,
      model: options.model || 'normal',
      mode: 'my-mode',
      output: [],
    };
    this.#state = State.fromInit(options.state || {});
  }

  get prompt() { return this.#prompt; }
  get id() { return this.#prompt.id; }
  get userId() { return this.#prompt.userId; }
  get state() { return this.#state; }
  get usage() { return this.#usage; }

  run = async (): Promise<Prompt> => {
    // Your execution logic here:
    // 1. Call prepare() on plugins to get tools + context
    // 2. Call the LLM
    // 3. Process the response
    // 4. Push outputs to this.#prompt.output
    // 5. Publish events via EventService
    // 6. Set this.#prompt.state = 'completed'
    // 7. Publish promptCompletedEvent
    return this.#prompt;
  };

  approve = async (toolCallId: string): Promise<void> => undefined;
  reject = async (toolCallId: string, reason?: string): Promise<void> => undefined;
}
```

### 2. Register the Mode in a Plugin

Register your mode in the plugin's `setup()` hook:

```typescript
import { createPlugin, ExecutionModeService } from '@morten-olsen/agentic-core';

const myPlugin = createPlugin({
  id: 'my-plugin',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const modeService = services.get(ExecutionModeService);
    modeService.register({
      id: 'my-mode',
      name: 'My Custom Mode',
      createExecutor: (options) => new MyExecutor(options),
    });
  },
});
```

### 3. Use It

```bash
curl -X POST http://localhost:4000/api/prompt \
  -d '{"input": "hello", "mode": "my-mode"}'
```

### Key Contracts

Your executor **must**:

- Set `prompt.state = 'completed'` when done
- Publish `promptCompletedEvent` with the final output and usage
- Publish `promptOutputEvent` for each output added during execution
- Push all outputs to `prompt.output`

Your executor **should**:

- Publish `promptStreamEvent` for real-time text streaming
- Track token usage in the `usage` property
- Call `prepare()` on plugins to collect tools and context
- Handle errors gracefully and record them as outputs

## Key Files

| File | Purpose |
|------|---------|
| `core/src/prompt/prompt.executor.ts` | `PromptExecutor`, `ExecutorCreateOptions`, `ExecutionModeFactory` types |
| `core/src/prompt/prompt.mode.ts` | `ExecutionModeService` — mode registry |
| `core/src/prompt/prompt.service.ts` | `PromptService` — dispatches to modes via `create()` |
| `core/src/prompt/prompt.completion.ts` | `PromptCompletion` — classic mode executor |
| `interpreter/src/mode/mode.executor.ts` | `CodeExecutor` — code mode executor |
| `interpreter/src/mode/mode.functions.ts` | Sandbox function setup (tools, output, done, etc.) |
| `interpreter/src/mode/mode.prompt.ts` | System prompt builder for code mode |
