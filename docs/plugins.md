# Plugins

Plugins are the primary extension mechanism. A plugin can contribute tools, inject system context, manage state, and initialize resources. Everything beyond the basic agent loop is delivered through plugins.

## Defining a Plugin

Use `createPlugin()` to define a plugin:

```typescript
import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const myPlugin = createPlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'Does useful things',
  config: z.object({
    apiUrl: z.string(),
  }),
  state: z.object({
    counter: z.number(),
  }),
  setup: async ({ config, services }) => {
    // One-time initialization; config is typed as { apiUrl: string }
  },
  prepare: async ({ config, context, tools, state, services }) => {
    // Called before each prompt; config is the same typed value
  },
});

export { myPlugin };
```

### Plugin Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier. Used as the state storage key. |
| `name` | No | Human-readable name. |
| `description` | No | Description of what the plugin does. |
| `config` | Yes | Zod schema defining the plugin's configuration shape. Use `z.unknown()` if you don't need config. The inferred type is passed to both `setup` and `prepare`. |
| `state` | Yes | Zod schema defining the shape of this plugin's state. Use `z.unknown()` if you don't need state. |
| `setup` | No | Async function called once when the plugin is registered. Receives `config`. |
| `prepare` | No | Async function called before each prompt in the agent loop. Receives `config`. |
| `tools` | No | Static list of tools (prefer adding tools dynamically in `prepare` instead). |

## Lifecycle

### Registration (`setup`)

`setup()` is called once when the plugin is registered via `pluginService.register()`. Use it for:

- Initializing databases and running migrations
- Setting up event listeners
- Validating configuration
- Registering sub-services

```typescript
const myPlugin = createPlugin({
  id: 'my-plugin',
  config: z.object({
    dbPath: z.string(),
  }),
  state: z.unknown(),
  setup: async ({ config, services }) => {
    // config.dbPath is typed as string
    // Run database migrations on startup
    const databaseService = services.get(DatabaseService);
    const db = await databaseService.get(myDatabase);

    // Register skills that this plugin provides
    const skillService = services.get(SkillService);
    skillService.registerSkill({
      id: 'my-skill',
      description: 'A capability provided by my plugin',
      instruction: 'When this skill is active, you can...',
      tools: [mySkillTool],
    });
  },
});
```

### Preparation (`prepare`)

`prepare()` is called before every prompt in the agent loop. The framework creates a shared `PluginPrepareContext` that accumulates tools, context, and state across all plugins. Each plugin receives its own `PluginPrepare` view (via `PluginPrepareContext.forPlugin(config)`) with a typed `config` getter and shared access to the mutable collections. Each registered plugin's `prepare()` is called in order.

The `PluginPrepare` object exposes:

| Property | Type | Description |
|----------|------|-------------|
| `config` | `z.infer<TConfig>` | The plugin's typed configuration, as passed during registration. |
| `context` | `Context` | System context. Push items to `context.items[]` to add system instructions. |
| `tools` | `Tool[]` | Available tools. Push tools to make them available for this prompt. |
| `state` | `State` | Plugin state manager. Read/write state scoped to this plugin. |
| `services` | `Services` | The DI container. |
| `prompts` | `Prompt[]` | Conversation history including the current prompt. |

```typescript
const myPlugin = createPlugin({
  id: 'my-plugin',
  config: z.object({
    enableAdvanced: z.boolean(),
  }),
  state: z.object({
    mode: z.enum(['basic', 'advanced']),
  }),
  prepare: async ({ config, context, tools, state, services }) => {
    // Add system context
    context.items.push({
      type: 'instruction',
      content: 'You are a helpful assistant with access to triggers.',
    });

    // Add tools based on config and state
    tools.push(baseTool);

    if (config.enableAdvanced) {
      const pluginState = state.getState(myPlugin);
      if (pluginState?.mode === 'advanced') {
        tools.push(advancedTool);
      }
    }
  },
});
```

## Registering Plugins

Plugins are registered through `PluginService`. Each plugin is registered individually with its configuration value:

```typescript
import { PluginService, Services } from '@morten-olsen/agentic-core';

const services = new Services();
const pluginService = services.get(PluginService);

// Register each plugin with its config
await pluginService.register(triggerPlugin, { cronExpression: '0 * * * *' });
await pluginService.register(skillPlugin, { maxActive: 5 });
await pluginService.register(myPlugin, { apiUrl: 'https://example.com' });
```

Registration calls `setup()` on the plugin with `config`, `services`, and `secrets`. If `setup()` throws, registration stops.

## Adding Context

Context items are system-level instructions sent to the model. Each item has a `type`, optional `id`, and `content`:

```typescript
prepare: async ({ context }) => {
  context.items.push({
    type: 'system-instruction',
    content: 'Always respond in a friendly tone.',
  });

  context.items.push({
    type: 'active-trigger',
    id: 'trigger-123',
    content: 'You are running as part of a scheduled trigger. Goal: check emails.',
  });
},
```

Context items are converted to system messages in the model call.

## Adding Tools

Push tools into the `tools` array to make them available for the current prompt:

```typescript
import { myTool, conditionalTool } from './tools/tools.js';

prepare: async ({ tools, state }) => {
  // Always available
  tools.push(myTool);

  // Conditionally available based on state
  const pluginState = state.getState(myPlugin);
  if (pluginState?.featureEnabled) {
    tools.push(conditionalTool);
  }
},
```

## Managing State

State is scoped per plugin (keyed by `plugin.id`) and persists across tool calls within a conversation. See [State](./state.md) for details.

```typescript
prepare: async ({ state }) => {
  // Read current state
  const current = state.getState(myPlugin);

  // State may be undefined on first access
  if (!current) {
    state.setState(myPlugin, { counter: 0 });
  }
},
```

## Complete Example: Trigger Plugin

The trigger plugin demonstrates all plugin capabilities including config:

```typescript
import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { triggerReferenceSchema } from '../schemas/schemas.js';
import { TriggerService } from '../service/service.js';
import { createCurrentTriggerTools, triggerTools } from '../tools/tools.js';
import { database } from '../database/database.js';

const triggerPlugin = createPlugin({
  id: 'trigger',

  // Config schema — validated at registration
  config: z.unknown(),

  // State tracks which trigger is currently active
  state: z.object({
    from: triggerReferenceSchema,
  }),

  // One-time setup: run migrations, verify data
  setup: async ({ config, services }) => {
    const databaseService = services.get(DatabaseService);
    const db = await databaseService.get(database);
    const result = await db.selectFrom('triggers_triggers').selectAll().execute();
    console.log(result);
  },

  // Per-prompt preparation
  prepare: async ({ config, tools, context, state, services }) => {
    // Always provide trigger management tools
    tools.push(...triggerTools);

    // If we're running from a trigger, add trigger-specific context
    const triggerState = state.getState(triggerPlugin);
    if (!triggerState?.from) {
      return;
    }

    const triggerService = services.get(TriggerService);
    const trigger = await triggerService.get(triggerState.from.id);

    // Non-once triggers get additional management tools
    if (triggerState.from.type !== 'once') {
      tools.push(...createCurrentTriggerTools(triggerState.from.id));
    }

    // Inject continuation message from previous runs
    if (trigger.continuation) {
      context.items.push({
        type: 'trigger-continuation',
        content: `Your continuation message from last run was\n\n${trigger.continuation}`,
      });
    }
  },
});

export { triggerPlugin };
```

## Complete Example: Skill Plugin

The skill plugin shows dynamic tool management through state:

```typescript
import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { SkillService } from '../service/service.js';
import { skillTools } from '../tools/tools.js';

const skillPlugin = createPlugin({
  id: 'skills',

  config: z.unknown(),

  // State tracks which skills are currently active
  state: z.object({
    active: z.array(z.string()),
  }),

  prepare: async ({ config, context, tools, state, services }) => {
    const skillService = services.get(SkillService);
    const skillState = state.getState(skillPlugin);

    // Gather instructions and tools from active skills
    const fromSkills = skillService.prepare(skillState?.active || []);

    // Inject skill instructions as context
    context.items.push(
      ...fromSkills.instructions.map((item) => ({
        type: 'skill-instruction',
        content: item,
      })),
    );

    // Add tools from active skills
    tools.push(...fromSkills.tools);

    // Add skill management tools (activate, deactivate, list)
    tools.push(...Object.values(skillTools));
  },
});

export { skillPlugin };
```

## Plugin Design Guidelines

1. **Choose a unique `id`** - The ID is used as the state storage key and should be stable across versions.

2. **Keep `setup()` fast** - It runs at application startup. Defer heavy work to `prepare()` or lazy initialization.

3. **Prefer dynamic tools in `prepare()`** - Adding tools in `prepare()` lets you conditionally include them based on state, rather than always exposing them.

4. **Use context items for instructions** - Don't embed instructions in tool descriptions. Use `context.items` to give the model system-level guidance.

5. **Validate state with Zod** - The `state` schema is used for runtime validation when reading/writing state. Choose a schema that accurately represents your plugin's state shape.

6. **Namespace tool IDs** - Prefix tool IDs with your plugin name (e.g., `trigger.create`, `skill.activate`) to avoid collisions.
