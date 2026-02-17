# Skill Plugin

The skill plugin provides a dynamic capability system for the agent. Skills are optional feature bundles (instructions + tools) that can be activated or deactivated per conversation. This keeps the agent's context lean — only active skills contribute tools and instructions to each prompt.

## Registration

```typescript
import { skillPlugin, SkillService } from '@morten-olsen/agentic-skill';

await pluginService.register(skillPlugin);
```

No configuration options. Plugin ID: `'skills'`.

### Registering Skills

Other packages register skills via `SkillService`:

```typescript
const skillService = services.get(SkillService);

skillService.registerSkill({
  id: 'web-search',
  description: 'Search the web for current information',
  instruction: 'Use the search tool to find up-to-date information. Prefer authoritative sources.',
  tools: [searchTool, fetchTool],
});
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique skill identifier |
| `description` | yes | Shown to the agent via `skill.list` |
| `instruction` | no | Injected as context when the skill is active |
| `tools` | no | Tools added to the prompt when the skill is active |

## Available Tools

### `skill.list`

Lists all available (inactive) skills with their descriptions.

```typescript
// input
{}
// output
[{ id: "web-search", description: "Search the web..." }]
```

### `skill.activate`

Activates a skill by ID. The skill's instruction and tools will be included in subsequent prompts.

```typescript
{ id: "web-search" }
```

### `skill.deactivate`

Deactivates a skill by ID. Its instruction and tools are removed from subsequent prompts.

```typescript
{ id: "web-search" }
```

## How It Works

The plugin uses per-conversation state to track active skills:

```typescript
// State schema
z.object({
  active: z.array(z.string()),  // active skill IDs
})
```

On each prompt (prepare hook):
1. Read `active` skill IDs from state
2. Call `SkillService.prepare(active)` to collect instructions and tools from matching skills
3. Add each skill's instruction as a context item (type: `'skill-instruction'`)
4. Merge active skill tools with the management tools (`skill.list`, `skill.activate`, `skill.deactivate`)

### Example Flow

```
Agent receives: "Search for today's weather"
  → Calls skill.list → sees "web-search" available
  → Calls skill.activate({ id: "web-search" })
  → Next prompt includes search tools + instruction
  → Agent uses searchTool to find weather
  → Later: skill.deactivate({ id: "web-search" })
```

## Dependencies

- `@morten-olsen/agentic-core` — plugin creation, tool definitions, state management
