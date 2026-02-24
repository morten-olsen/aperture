# 015: Code Mode Enhancements

**Status**: Draft

## Overview

The code execution mode (spec 014) works but has several limitations: tool calls are sequential, no external libraries are available, large data can't persist efficiently across turns, the system prompt includes all tool descriptions in a verbose format, and plugins that register functions on the `InterpreterService` singleton (e.g. artifact's `getArtifact`) are invisible to code mode because `CodeExecutor` creates a fresh `InterpreterService` each iteration.

This spec addresses ten areas:

1. **InterpreterService.clone()** — Bug fix ensuring plugin-registered functions are available in code mode
2. **Parallel execution** — `parallel()` host function for concurrent tool invocations
3. **External library support** — Module registration via `addModule()`, auto-detection of import statements
4. **LLM sub-calls** — `llm()` and `llmJson()` functions for text/JSON completions from sandbox code
5. **Data persistence** — Artifact store/list capabilities exposed to both code and classic modes
6. **Tool discovery optimization** — Compact grouped tool listing in the system prompt
7. **Enhanced interpreter.run tool** — Classic mode's `interpreter.run-code` tool gains access to all conversation tools, enabling selective code execution for parallel operations or data processing within an otherwise natural-language conversation
8. **Execution timeout** — Configurable timeout (default 30s) prevents runaway code from hanging indefinitely
9. **Enhanced error context** — Errors include line numbers, column positions, and code context for faster debugging
10. **Structured output mode** — `complete()` helper function for consistent response formatting

All changes respect the multi-mode architecture — no code-mode-specific semantics leak into core (except the minor `responseFormat` addition to `CompletionMessagesInput`).

## Scope

**In scope**

- `InterpreterService.clone()` method and executor fix
- `parallel()` host function for concurrent tool calls
- Module eval type auto-detection (import statements → `evalType: 'module'`)
- `llm()` and `llmJson()` sandbox functions
- `responseFormat` option on `CompletionMessagesInput`
- `ArtifactService.list()` method
- `storeArtifact()` and `listArtifacts()` interpreter functions (artifact plugin)
- `artifact.store` and `artifact.list` tools for classic mode parity
- Optimized tool listing format in code mode system prompt
- Module name listing in system prompt
- Enhanced `interpreter.run-code` tool with conversation tools injection
- Execution timeout with configurable duration (default 30s)
- Enhanced error reporting with line numbers, columns, and code context
- `complete()` structured output helper function

**Out of scope**

- Bundling specific external libraries (plugins register their own via `addModule()`)
- Streaming within sandbox execution
- Approval flow for parallel tool calls
- Code mode configuration schema
- Explicit `async`/`await` syntax in sandbox code (functions are transparently async via asyncify)

## Data Model

No new database tables. The `artifact_artifacts` table is unchanged — `ArtifactService.list()` reads existing columns.

## API / Service Layer

### InterpreterService.clone()

New method on `InterpreterService` that creates a new instance inheriting all registered methods and modules from the source:

```typescript
public clone = (): InterpreterService => {
  const copy = new InterpreterService();
  copy.#methods = { ...this.#methods };
  copy.#modules = { ...this.#modules };
  return copy;
};
```

`CodeExecutor` changes from `new InterpreterService()` to `services.get(InterpreterService).clone()`. This ensures functions registered during plugin `setup()` (e.g. `getArtifact`, `storeArtifact`, `listArtifacts`) are available in code mode.

### CompletionMessagesInput.responseFormat

Added optional `responseFormat` field:

```typescript
type CompletionMessagesInput = {
  messages: ChatMessage[];
  maxTokens?: number;
  model?: string;
  responseFormat?: { type: 'json_object' | 'text' };
};
```

Passed through to `client.chat.completions.create()` as `response_format`.

### Transparent Async Execution

All host functions exposed to the sandbox use QuickJS's `newAsyncifiedFunction`, which makes async operations appear synchronous to the sandbox code. The sandbox code does NOT use `async`/`await` keywords — instead, functions that perform async operations (like tool calls, `llm()`, `llmJson()`) automatically suspend and resume execution internally.

**Example sandbox code:**
```javascript
// No await needed — the function call suspends internally
const weather = weatherGetWeather({ latitude: 55.67, longitude: 12.56 });
const summary = llm("Summarize: " + JSON.stringify(weather));
output(summary);
done();
```

This design was chosen because:
1. Simpler mental model for the LLM — all functions behave the same way
2. Avoids QuickJS promise resolution lifetime issues with explicit await
3. Consistent with how the sandbox already worked for tool calls

### Execution Timeout

The `InterpreterService.execute()` method now supports a configurable timeout (default 30 seconds) to prevent runaway code:

```typescript
type ExecuteOptions = RunCodeInput & {
  evalType?: 'global' | 'module';
  timeout?: number; // milliseconds, default 30000
};
```

The timeout uses QuickJS's interrupt handler mechanism, checking elapsed time periodically during execution. When exceeded, execution terminates and returns:

```typescript
{ error: "Execution timed out after 30000ms", timeout: true }
```

### Enhanced Error Context

When execution fails, errors now include location information parsed from QuickJS error messages:

```typescript
type ExecutionError = {
  error: string;       // Error message
  line?: number;       // 1-based line number in code
  column?: number;     // 1-based column position
  context?: string;    // The offending line of code (trimmed)
};
```

**Example error output:**
```json
{
  "error": "'weather' is not defined",
  "line": 3,
  "column": 12,
  "context": "const x = weather.getWeather();"
}
```

This helps the LLM quickly identify and fix issues without re-analyzing the entire code.

### Structured Output Mode

The `complete()` function provides a structured alternative to manual `output()` + `done()` calls:

```typescript
complete({
  response: string,      // Required: text to output to user
  data?: unknown,        // Optional: stored as '_lastData' for recall()
  followUp?: string      // Optional: appended after response (e.g., "Would you like more details?")
})
```

**Example usage:**
```javascript
const weather = weatherGetWeather({ latitude: 55.67, longitude: 12.56 });
complete({
  response: `The weather is ${weather.description} at ${weather.temperature}°C.`,
  data: weather,
  followUp: "Would you like the forecast for tomorrow?"
});
```

Benefits:
- Enforces consistent response structure
- Automatically calls `done()` to prevent continuation loops
- Optionally persists data for later retrieval
- Separates main response from follow-up prompts

### ArtifactService.list()

Returns metadata (without data) for all artifacts:

```typescript
public list = async (): Promise<{ id: string; type: string; description: string | null; createdAt: string }[]>
```

## Tool Definitions

### artifact.store (classic mode)

| Field | Value |
|-------|-------|
| ID | `artifact.store` |
| Input | `{ type?: string, description?: string, data: unknown }` |
| Output | `{ id: string }` |
| Description | Store data as an artifact for later retrieval |

### artifact.list (classic mode)

| Field | Value |
|-------|-------|
| ID | `artifact.list` |
| Input | `{}` |
| Output | `Array<{ id, type, description, createdAt }>` |
| Description | List all stored artifacts with metadata |

### Sandbox Functions (code mode)

| Function | Signature | Description |
|----------|-----------|-------------|
| `parallel(calls)` | `([{tool, input}]) → results[]` | Execute tool calls concurrently; failures return `{error}` |
| `llm(prompt)` | `(string) → string` | Simple text completion sub-call |
| `llmJson(prompt)` | `(string) → object` | JSON-structured completion sub-call |
| `complete(opts)` | `({response, data?, followUp?}) → void` | Structured output: outputs response, stores data, calls done() |
| `storeArtifact(data, desc?)` | `(unknown, string?) → string` | Store data, returns artifact ID |
| `listArtifacts()` | `() → [{id, type, description, createdAt}]` | List stored artifacts |

### interpreter.run-code (enhanced)

The existing `interpreter.run-code` tool is enhanced to receive conversation tools via the `prepare()` context. When invoked from classic mode, the sandbox now has access to:

1. **Plugin-registered functions** — `getArtifact`, `storeArtifact`, `listArtifacts`, etc. (via `clone()`)
2. **Conversation tools** — All tools from the current `prepare()` cycle, exposed as camelCase functions
3. **Utility functions** — `parallel()`, `llm()`, `llmJson()`, `log()`, `store()`, `recall()`

| Field | Value |
|-------|-------|
| ID | `interpreter.run-code` |
| Input | `{ code: string, input?: unknown, timeout?: number }` |
| Output | `unknown` |
| Description | Dynamic — lists available functions and modules |

The optional `timeout` parameter (milliseconds, default 30000) allows callers to set execution limits.

**Use case**: In classic mode, when the LLM needs to:
- Execute multiple independent tool calls in parallel
- Process/transform data returned from previous tool calls
- Perform complex calculations or data aggregation

The LLM can use `interpreter.run-code` to drop into JavaScript, invoke tools via their camelCase names or `parallel()`, and return the processed result — all within a single tool call.

**Example** — parallel weather lookup in classic mode:

```javascript
// LLM calls interpreter.run-code with this code:
const cities = [
  { lat: 55.67, lon: 12.56 },  // Copenhagen
  { lat: 48.85, lon: 2.35 },   // Paris
  { lat: 51.50, lon: -0.12 },  // London
];

const results = parallel(cities.map(c => ({
  tool: 'weather.get-weather',
  input: { latitude: c.lat, longitude: c.lon }
})));

results.map((r, i) => `${['Copenhagen', 'Paris', 'London'][i]}: ${r.temperature}°C`).join('\n');
```

This enables classic mode to benefit from parallel execution without switching to full code mode.

## Plugin Behavior

### Interpreter Plugin

**`setup()`** — Registers `'code'` execution mode (unchanged).

**`prepare()`** — Enhanced to create the `interpreter.run-code` tool with conversation tools injected. The tool factory now receives the full `tools` array from the prepare context:

```typescript
prepare: async ({ tools, services, userId, state }) => {
  const interpreterService = services.get(InterpreterService);
  tools.push(interpreterTools.createRunCode({
    interpreterService,
    tools,        // ← conversation tools for injection
    userId,
    state,
    services,
  }));
},
```

The `createRunCode` factory clones the interpreter, sets up agent functions (including `parallel`, `llm`, `llmJson`, and all conversation tools as camelCase functions), and returns a tool that executes code in this enriched sandbox.

### Artifact Plugin

**`setup()`** — Extended to expose `storeArtifact` and `listArtifacts` on the `InterpreterService` singleton (alongside existing `getArtifact`). Uses dynamic `import()` to break circular dependencies.

**`prepare()`** — Extended to push `artifact.store` and `artifact.list` tools (alongside existing `artifact.get`). This gives classic mode parity with code mode's sandbox functions.

### Module Auto-Detection

When the generated code contains an `import` statement (`/\bimport\s/`), the executor sets `evalType: 'module'` so QuickJS evaluates the code as an ES module. This allows sandbox code to import registered modules without requiring a separate configuration step.

### System Prompt Changes

The code mode system prompt now:
1. Mentions `parallel()`, `llm()`, `llmJson()` in the rules section
2. Groups tools by plugin namespace in a compact format:
   ```
   **weather**: weatherGetWeather — Get current weather
   **todo**: todoCreate — Create a todo item | todoList — List all todos
   ```
3. Lists available modules (if any are registered)
4. Conditionally allows/disallows import statements based on module availability
5. Suggests using `toolSchema(toolId)` to inspect input schemas before first use

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| `parallel()` — individual tool failure | Result slot contains `{error: "message"}`, other calls unaffected |
| `parallel()` — invalid argument | Throws `Error("parallel() expects an array of {tool, input} objects")` |
| `parallel()` — unknown tool ID | Result slot contains `{error: "Tool \"x\" not found"}` |
| `llm()` / `llmJson()` — API failure | Exception propagates to sandbox, recorded on next iteration |
| `llmJson()` — invalid JSON response | Returns raw string instead of throwing |
| `clone()` — no methods registered | Returns empty InterpreterService (safe, just means no plugin functions) |
| Module import — unknown module | QuickJS returns module-not-found error, fed back to model |
| `storeArtifact()` — database error | Exception propagates to sandbox |
| Execution timeout | Returns `{error: "Execution timed out after Xms", timeout: true}` |
| Syntax error | Returns `{error: "message", line: N, column: N, context: "code line"}` |
| Runtime exception | Returns `{error: "message", line?: N, column?: N, context?: "code line"}` |
| `interpreter.run-code` — tool call fails within code | Error returned to sandbox code, can be caught or will propagate |

## Configuration

No new configuration. All features use existing configuration:

| Option | Source | Description |
|--------|--------|-------------|
| `OPENAI_API_KEY` | env | Used by `llm()` / `llmJson()` via CompletionService |
| `OPENAI_BASE_URL` | env | Used by `llm()` / `llmJson()` via CompletionService |

Modules are registered programmatically via `interpreterService.addModule()` by plugins or server configuration during `setup()`.

## Boundary

**`core` owns:**
- `CompletionMessagesInput` with `responseFormat` field
- `CompletionService.completeMessages()` passing `response_format` through

**`interpreter` owns:**
- `InterpreterService.clone()` method
- `CodeExecutor` using `.clone()` instead of `new InterpreterService()`
- Module auto-detection (`evalType: 'module'` when imports detected)
- `parallel()`, `llm()`, `llmJson()` sandbox functions
- Optimized system prompt format with grouped tools and module listing
- Enhanced `interpreter.run-code` tool with conversation tools injection

**`artifact` owns:**
- `ArtifactService.list()` method
- `storeArtifact` / `listArtifacts` interpreter functions (registered in `setup()`)
- `artifact.store` / `artifact.list` tools (contributed in `prepare()`)

## Implementation Order

1. `InterpreterService.clone()` + executor fix (foundation, fixes bug)
2. `CompletionMessagesInput.responseFormat` (core change, needed by llmJson)
3. `parallel()`, `llm()`, `llmJson()` sandbox functions
4. Module auto-detection + system prompt updates
5. `ArtifactService.list()` + artifact plugin extensions + tools
6. Enhanced `interpreter.run-code` tool with conversation tools injection
7. Spec document

## Key Files

| File | Change |
|------|--------|
| `packages/interpreter/src/service/service.ts` | Add `clone()`, timeout, enhanced errors |
| `packages/interpreter/src/schemas/schemas.ts` | Add `timeout` option to `runCodeInput` |
| `packages/interpreter/src/mode/mode.executor.ts` | Use `clone()`, add import auto-detection, pass moduleNames to prompt |
| `packages/interpreter/src/mode/mode.functions.ts` | Add `parallel()`, `llm()`, `llmJson()`, `complete()` |
| `packages/interpreter/src/mode/mode.prompt.ts` | Optimized tool listing, module info, new function docs |
| `packages/core/src/completion/completion.service.ts` | Add `responseFormat` option |
| `packages/artifact/src/service/service.ts` | Add `list()` method |
| `packages/artifact/src/plugin/plugin.ts` | Expose `storeArtifact`/`listArtifacts`, push new tools |
| `packages/artifact/src/tools/tools.store.ts` | NEW — `artifact.store` tool |
| `packages/artifact/src/tools/tools.list.ts` | NEW — `artifact.list` tool |
| `packages/artifact/src/tools/tools.ts` | Updated barrel — includes store + list |
| `packages/interpreter/src/tools/tools.run-code.ts` | Enhanced to accept and inject conversation tools |
| `packages/interpreter/src/plugin/plugin.ts` | Pass tools/userId/state/services to tool factory |
