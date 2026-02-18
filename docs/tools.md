# Tools

Tools are typed functions that the AI model can call during a conversation. Each tool has a Zod-validated input and output schema, a description for the model, and an async `invoke` function.

## Defining a Tool

Use `createTool()` to define a tool:

```typescript
import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const searchTool = createTool({
  id: 'notes.search',
  description: 'Search notes by keyword',
  input: z.object({
    query: z.string(),
    limit: z.number().default(10),
  }),
  output: z.object({
    results: z.array(z.object({
      id: z.string(),
      title: z.string(),
      snippet: z.string(),
    })),
  }),
  invoke: async ({ input, state, services }) => {
    const noteService = services.get(NoteService);
    const results = await noteService.search(input.query, input.limit);
    return { results };
  },
});

export { searchTool };
```

### Tool Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier. Convention: `{plugin}.{action}` (e.g., `trigger.create`). |
| `description` | `string` | Description shown to the model. Be concise and specific about what the tool does. |
| `input` | `ZodType` | Zod schema for the tool's input. Converted to JSON Schema for the model. |
| `output` | `ZodType` | Zod schema for the tool's output. Used for type inference. |
| `requireApproval` | `ApprovalRequest \| RequireApproval<TInput>` | Optional. Gate that pauses execution for human approval. See [Human Approval](#human-approval). |
| `invoke` | `(input: ToolInput) => Promise<Output>` | Async function that executes the tool. |

### The `invoke` Function

The `invoke` function receives a `ToolInput` object with:

| Property | Type | Description |
|----------|------|-------------|
| `input` | Inferred from input schema | The validated, parsed input from the model. |
| `state` | `State` | Plugin state manager. Read/write any plugin's state. |
| `services` | `Services` | The DI container. Access any registered service. |

```typescript
invoke: async ({ input, state, services }) => {
  // `input` is fully typed based on the input schema
  // `state` lets you read/write plugin state
  // `services` gives access to the DI container
}
```

## Input Schema

The input schema defines what arguments the model can pass to the tool. It is converted to JSON Schema via `tool.input.toJSONSchema()` and sent to the model as part of the function definition.

```typescript
const input = z.object({
  title: z.string().describe('The title of the trigger'),
  goal: z.string().describe('What the trigger should accomplish'),
  schedule: z.object({
    type: z.enum(['once', 'cron']).describe('Whether this runs once or on a schedule'),
    value: z.string().describe('ISO date for once, cron expression for cron'),
  }),
});
```

Use `.describe()` on fields to give the model additional context about each parameter.

When the model calls the tool, the framework:

1. Parses the JSON arguments from the model with `tool.input.parse()`
2. Passes the validated result to `invoke()` as `input`

## Output Schema

The output schema defines the return type. The `invoke` function must return data matching this schema:

```typescript
const output = z.object({
  id: z.string(),
  created: z.boolean(),
});
```

The return value is serialized to JSON and fed back to the model as the tool call result.

## Accessing State

Tools can read and write plugin state. This is how tools communicate back to the plugin system:

```typescript
const activateTool = createTool({
  id: 'skill.activate',
  description: 'Activate a skill',
  input: z.object({ id: z.string() }),
  output: z.object({ success: z.boolean() }),
  invoke: async ({ input, state }) => {
    // Dynamic import to avoid circular dependency
    const { skillPlugin } = await import('../plugin/plugin.js');

    // Read current state
    const skillState = state.getState(skillPlugin);
    const active = skillState?.active || [];

    // Write updated state
    state.setState(skillPlugin, {
      ...skillState,
      active: [...new Set([...active, input.id])],
    });

    return { success: true };
  },
});

export { activateTool };
```

## Accessing Services

Tools can access the full DI container to interact with services:

```typescript
const createTriggerTool = createTool({
  id: 'trigger.create',
  description: 'Create a new trigger',
  input: triggerCreateSchema,
  output: triggerSchema,
  invoke: async ({ input, services }) => {
    const databaseService = services.get(DatabaseService);
    const db = await databaseService.get(triggerDatabase);

    const id = randomUUID();
    await db.insertInto('triggers').values({ id, ...input }).execute();

    return { ...input, id, createdAt: new Date().toISOString() };
  },
});
```

## Making Tools Available

Tools are made available to the model in two ways:

### 1. In `prepare()` (Recommended)

Push tools into the `tools` array during the plugin's `prepare()` phase. This gives you control over when tools are available:

```typescript
const myPlugin = createPlugin({
  id: 'my-plugin',
  state: z.unknown(),
  prepare: async ({ tools, state }) => {
    // Always available
    tools.push(listTool);
    tools.push(createTool);

    // Only available when a specific condition is met
    const pluginState = state.getState(myPlugin);
    if (pluginState?.hasActiveItem) {
      tools.push(updateTool);
      tools.push(deleteTool);
    }
  },
});
```

### 2. In the `tools` field (Static)

For tools that should always be available when the plugin is registered:

```typescript
const myPlugin = createPlugin({
  id: 'my-plugin',
  state: z.unknown(),
  tools: [listTool, createTool],
});
```

Prefer `prepare()` for most cases - it gives you more flexibility.

## Dynamic Tool Generation

You can generate tools dynamically based on runtime data:

```typescript
const createCurrentTriggerTools = (triggerId: string) => [
  createTool({
    id: 'trigger.current.update',
    description: 'Update the current trigger',
    input: triggerUpdateSchema,
    output: triggerSchema,
    invoke: async ({ input, services }) => {
      const triggerService = services.get(TriggerService);
      return triggerService.update(triggerId, input);
    },
  }),
];

// In prepare():
tools.push(...createCurrentTriggerTools(currentTriggerId));
```

## Human Approval

Tools can require human approval before execution by setting `requireApproval`. When approval is required, the agent loop pauses, persists its state, and fires an `approval-requested` event. External UI (e.g., Telegram inline keyboards) can then approve or reject the call, resuming the loop.

### Static Approval

Use a plain object when the tool always requires approval:

```typescript
const addDomainTool = createTool({
  id: 'web-fetch.add-domain',
  description: 'Add a domain to the fetch allowlist',
  input: z.object({ domain: z.string() }),
  output: z.object({ domain: z.string(), added: z.boolean() }),
  requireApproval: { required: true, reason: 'Adding a domain grants permanent fetch access.' },
  invoke: async ({ input, services }) => {
    const service = services.get(WebFetchService);
    const added = await service.addDomain(input.domain);
    return { domain: input.domain.toLowerCase(), added };
  },
});
```

### Dynamic Approval

Use a function when approval depends on runtime conditions. The function receives the same `ToolInput` as `invoke`:

```typescript
const fetchTool = createTool({
  id: 'web-fetch.fetch',
  description: 'Fetch a URL',
  input: z.object({ url: z.string() }),
  output: fetchResultSchema,
  requireApproval: async ({ input, services }) => {
    const service = services.get(WebFetchService);
    const domain = new URL(input.url).hostname.toLowerCase();
    const allowed = await service.isAllowed(domain);
    return { required: !allowed, reason: `Domain "${domain}" is not on the allowlist.` };
  },
  invoke: async ({ input, services }) => {
    const service = services.get(WebFetchService);
    return service.fetch({ ...input, force: true });
  },
});
```

### The `ApprovalRequest` Type

| Field | Type | Description |
|-------|------|-------------|
| `required` | `boolean` | If `true`, the tool pauses for approval. If `false`, it runs immediately. |
| `reason` | `string` | Human-readable explanation shown in the approval UI. |

### Approval Lifecycle

1. Model calls a tool with `requireApproval`
2. Framework evaluates `requireApproval` (calls the function if dynamic)
3. If `required: true`: the tool output is recorded as `pending`, the prompt state becomes `waiting_for_approval`, and `approval-requested` is emitted
4. External code calls `completion.approve(toolCallId)` or `completion.reject(toolCallId, reason?)`
5. On approve: the tool's `invoke` runs, the result replaces pending, and the loop resumes
6. On reject: an error result replaces pending, and the loop resumes
7. If the model returned multiple tool calls in one batch, remaining calls are processed after the approval — and may trigger another pause if they also require approval

### Tool Fields

| Field | Type | Description |
|-------|------|-------------|
| `requireApproval` | `ApprovalRequest \| RequireApproval<TInput>` | Optional. Static object or async function returning `ApprovalRequest`. |

## How Tool Execution Works

During the agent loop:

1. The framework calls `prepare()` on all plugins, collecting tools
2. Tools are converted to OpenAI function format with JSON Schema parameters
3. The model decides whether to call a tool
4. If it does, the framework:
   - Parses the arguments with `tool.input.parse(JSON.parse(rawArgs))`
   - Evaluates `requireApproval` if present — if `required: true`, pauses the loop (see [Human Approval](#human-approval))
   - Calls `tool.invoke({ input, state, services })`
   - Records the result (success or error)
   - Feeds the result back to the model
5. The model can call more tools or produce a text response

## File Organization

Follow the project convention of `{module}/{module}.{area}.ts`:

```
tools/
├── tools.ts              Main file - re-exports all tools
├── tools.create.ts       Create tool implementation
├── tools.update.ts       Update tool implementation
├── tools.delete.ts       Delete tool implementation
└── tools.search.ts       Search tool implementation
```

The main `tools.ts` file aggregates and exports:

```typescript
import { create } from './tools.create.js';
import { update } from './tools.update.js';
import { remove } from './tools.delete.js';
import { search } from './tools.search.js';

const myTools = [create, update, remove, search];

export { myTools, create, update, remove, search };
```

## Tool Design Guidelines

1. **Namespace IDs** - Use `{plugin}.{action}` format (e.g., `trigger.create`, `skill.list`).

2. **Write clear descriptions** - The description is the model's primary guide for when and how to use the tool. Be specific about what it does, not how.

3. **Use `.describe()` on schema fields** - Give the model context about each parameter.

4. **Keep tools focused** - Each tool should do one thing. Prefer multiple specific tools over one general-purpose tool.

5. **Validate at the boundary** - The Zod schema handles input validation. Don't re-validate inside `invoke()`.

6. **Return structured data** - Return objects, not strings. The model can interpret structured data better.

7. **Handle errors** - Let errors propagate. The framework catches them and reports them back to the model as error results.
