# State

State provides per-plugin, per-conversation storage that persists across tool calls within a conversation. It enables tools and plugins to track information during an agent loop session.

## How State Works

Each plugin declares a `state` Zod schema in its definition. The `State` class stores data keyed by `plugin.id` and validates reads/writes against the plugin's schema.

```
┌────────────────────────────────────────┐
│ State                                  │
│                                        │
│  "trigger"  → { from: { id, type } }  │
│  "skills"   → { active: ["a", "b"] }  │
│  "my-plugin"→ { counter: 5 }          │
└────────────────────────────────────────┘
```

State is created fresh for each conversation session via `State.fromInit()` and lives for the duration of that session's agent loop.

## Defining Plugin State

Declare the state shape in your plugin definition using a Zod schema:

```typescript
import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const counterPlugin = createPlugin({
  id: 'counter',
  state: z.object({
    count: z.number(),
    lastUpdated: z.string().optional(),
  }),
  // ...
});
```

If your plugin doesn't need state, use `z.unknown()`:

```typescript
const statelessPlugin = createPlugin({
  id: 'stateless',
  state: z.unknown(),
  // ...
});
```

## Reading State

Use `state.getState(plugin)` to read the current state. Returns `undefined` if no state has been set yet:

```typescript
// In prepare()
prepare: async ({ state }) => {
  const current = state.getState(myPlugin);

  if (!current) {
    // First access - no state set yet
    return;
  }

  // `current` is typed based on your plugin's state schema
  console.log(current.count);
},
```

```typescript
// In a tool's invoke()
invoke: async ({ state }) => {
  const { myPlugin } = await import('../plugin/plugin.js');
  const current = state.getState(myPlugin);
  const count = current?.count ?? 0;
  // ...
},
```

## Writing State

Use `state.setState(plugin, value)` to write state. The value is validated against the plugin's Zod schema:

```typescript
// In a tool's invoke()
invoke: async ({ input, state }) => {
  const { myPlugin } = await import('../plugin/plugin.js');
  const current = state.getState(myPlugin);

  state.setState(myPlugin, {
    count: (current?.count ?? 0) + 1,
    lastUpdated: new Date().toISOString(),
  });

  return { success: true };
},
```

If the value doesn't match the schema, `setState` will throw a Zod validation error.

## State in Plugins

### Reading in `prepare()`

A common pattern is to change behavior based on current state:

```typescript
const skillPlugin = createPlugin({
  id: 'skills',
  state: z.object({
    active: z.array(z.string()),
  }),
  prepare: async ({ context, tools, state, services }) => {
    const skillService = services.get(SkillService);
    const skillState = state.getState(skillPlugin);

    // Use state to determine which tools and context to provide
    const fromSkills = skillService.prepare(skillState?.active || []);
    context.items.push(
      ...fromSkills.instructions.map((item) => ({
        type: 'skill-instruction',
        content: item,
      })),
    );
    tools.push(...fromSkills.tools);
  },
});
```

### Writing in `prepare()`

You can also initialize state in `prepare()`:

```typescript
prepare: async ({ state }) => {
  const current = state.getState(myPlugin);
  if (!current) {
    state.setState(myPlugin, { count: 0 });
  }
},
```

## State in Tools

Tools access state through their `ToolInput`:

```typescript
const incrementTool = createTool({
  id: 'counter.increment',
  description: 'Increment the counter',
  input: z.object({}),
  output: z.object({ count: z.number() }),
  invoke: async ({ state }) => {
    // Dynamic import to avoid circular dependency with the plugin
    const { counterPlugin } = await import('../plugin/plugin.js');

    const current = state.getState(counterPlugin);
    const newCount = (current?.count ?? 0) + 1;

    state.setState(counterPlugin, {
      count: newCount,
      lastUpdated: new Date().toISOString(),
    });

    return { count: newCount };
  },
});
```

## State Lifecycle

1. **Creation** - State is initialized when a `PromptCompletion` is created, optionally from initial values passed via `ConversationInstance`
2. **Per-prompt** - The same state object is shared across all tool calls and plugin prepare phases within a single prompt execution
3. **Validation** - Every `getState()` and `setState()` call validates against the plugin's Zod schema
4. **Scope** - State does not automatically persist between separate prompts in a conversation (this is a current limitation; the conversation layer manages history)

## Circular Dependency Pattern

When tools need to reference their parent plugin (to access state), use dynamic imports to avoid circular dependencies:

```typescript
// tools/tools.activate.ts
invoke: async ({ input, state }) => {
  // Dynamic import breaks the circular dependency
  const { skillPlugin } = await import('../plugin/plugin.js');
  const current = state.getState(skillPlugin);
  // ...
},
```

This is necessary because:
- The plugin imports tools (to register them in `prepare()`)
- Tools import the plugin (to read/write state)

## Design Guidelines

1. **Keep state minimal** - Only store what's needed for the current conversation session. Use databases for persistent storage.

2. **Handle `undefined`** - `getState()` returns `undefined` before the first `setState()` call. Always provide defaults.

3. **Prefer immutable updates** - Spread existing state when updating:
   ```typescript
   state.setState(myPlugin, { ...current, count: current.count + 1 });
   ```

4. **Use descriptive schemas** - The Zod schema documents what your plugin tracks:
   ```typescript
   state: z.object({
     active: z.array(z.string()).describe('Currently active skill IDs'),
     lastRefresh: z.string().optional().describe('ISO timestamp of last refresh'),
   }),
   ```
