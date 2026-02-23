# Adding Features — End to End

This guide walks through adding a new feature to the GLaDOS client app, from plugin tool registration through to a working screen with Storybook stories. It uses the **Todo** feature as a running example.

## Overview

```
1. Register API tools  → plugin self-registers tools via ToolRegistry in setup()
2. Regenerate types    → codegen script creates typed client bindings
3. Build components    → presentational React Native components with stories
4. Add screen & nav    → Expo Router file-based route + navigation
```

---

## Step 1: Register Tools via ToolRegistry

Plugins register tools for the AI agent, but the client app talks to the API server over HTTP. To make plugin tools available to the client, you register them with the `ToolRegistry` from core — the API server automatically exposes all registered tools.

### 1a. Create an API tools export in the plugin package

Group the tools the client needs into an array and export it from the package.

```ts
// packages/todo/src/tools/tools.ts
const todoApiTools: Tool[] = [createTask, listTasks, updateTask, removeTask, addTag, removeTag];

export { todoApiTools };
```

Re-export from the package entry point (`exports.ts`):

```ts
// packages/todo/src/exports.ts
export * from './tools/tools.js';
```

### 1b. Register tools in the plugin's setup()

In the plugin's `setup()` hook, get the `ToolRegistry` from services and register the tools:

```ts
// packages/todo/src/plugin/plugin.ts
import { createPlugin, ToolRegistry } from '@morten-olsen/agentic-core';

import { todoApiTools } from '../tools/tools.js';

const todoPlugin = createPlugin({
  id: 'todo',
  // ...
  setup: async ({ services }) => {
    // ... other setup (database, etc.)
    const toolRegistry = services.get(ToolRegistry);
    toolRegistry.registerTools(todoApiTools);
  },
});
```

No server-side wiring is needed — the API reads directly from `ToolRegistry`.

### What this gives you

- `GET /api/tools` now includes the todo tools with their JSON Schemas
- `POST /api/tools/todo.list/invoke` (etc.) invokes each tool over HTTP
- The `X-User-Id` header is injected as `userId` into every tool call

---

## Step 2: Regenerate Typed Client Bindings

The client uses auto-generated TypeScript types so that `useToolQuery` and `useToolInvoke` are fully type-safe.

### 2a. Update the snapshot

With the server running (and the new tools registered):

```bash
pnpm --filter @morten-olsen/agentic-expo generate
```

This fetches `GET /api/tools`, saves the response to `tools.snapshot.json`, and generates `src/generated/tools.ts`.

### 2b. Without a running server

If you don't have a server running, you can manually edit `tools.snapshot.json` to add the new tool definitions, then run:

```bash
npx tsx apps/expo/scripts/generate-tool-types.ts --snapshot apps/expo/tools.snapshot.json
```

### What this gives you

The generated file adds your tools to the type maps:

```ts
type ToolId = "conversation.list" | ... | "todo.list" | "todo.create" | ...;

type ToolInputMap = {
  "todo.list": { status?: "pending" | "in_progress" | ...; project?: string; ... };
  "todo.create": { title: string; description?: string; ... };
  // ...
};

type ToolOutputMap = {
  "todo.list": { tasks: Array<{ id: string; title: string; ... }>; total: number };
  // ...
};
```

Now `useToolQuery('todo.list', { status: 'pending' })` is fully type-checked — wrong field names or missing required fields are compile errors.

### Commit both files

Always commit `tools.snapshot.json` and `src/generated/tools.ts` together. This lets other developers and CI build without a running server.

---

## Step 3: Build Components

Components are presentational — they receive data and callbacks as props. Business logic (fetching, mutations) lives in the screen or in hooks.

### 3a. Create the component

Follow the project component structure: `src/components/{name}/{name}.tsx`.

```ts
// src/components/todo-list/todo-list.tsx
import { YStack, Text } from 'tamagui';
import { FlatList, Pressable } from 'react-native';

import { GlassView } from '../glass/glass-view.tsx';
import { AnimatedListItem } from '../animation/animated-list-item.tsx';

type TodoItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
};

type TodoListProps = {
  tasks: TodoItem[];
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
};

const TodoList = ({ tasks, onSelect, onRefresh, isLoading }: TodoListProps) => {
  // Presentational component — renders the list, delegates actions upward
  return (
    <FlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      onRefresh={onRefresh}
      refreshing={isLoading ?? false}
      renderItem={({ item, index }) => (
        <AnimatedListItem index={index}>
          <Pressable onPress={() => onSelect(item.id)}>
            <GlassView intensity="subtle" borderRadius={18} padding="$3">
              <Text color="$color">{item.title}</Text>
            </GlassView>
          </Pressable>
        </AnimatedListItem>
      )}
    />
  );
};

export { TodoList };
export type { TodoListProps, TodoItem };
```

### 3b. Add a Storybook story

Every component gets a story file alongside it: `{name}.stories.tsx`.

```ts
// src/components/todo-list/todo-list.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { fn } from 'storybook/test';

import { TodoList } from './todo-list.tsx';

const meta: Meta<typeof TodoList> = {
  component: TodoList,
};

type Story = StoryObj<typeof TodoList>;

const WithTasks: Story = {
  args: {
    tasks: [
      { id: '1', title: 'Buy groceries', status: 'pending', priority: 'medium' },
      { id: '2', title: 'Ship feature', status: 'in_progress', priority: 'high' },
    ],
    onSelect: fn(),
    onRefresh: fn(),
    isLoading: false,
  },
};

const Empty: Story = {
  args: {
    tasks: [],
    onSelect: fn(),
  },
};

export default meta;
export { WithTasks, Empty };
```

Run Storybook to verify:

```bash
pnpm --filter @morten-olsen/agentic-expo storybook
```

### Design patterns

- Use `GlassView` for card surfaces (see [Design Principles](./design-principal.md))
- Use `Page` for screen chrome (large title for top-level, inline for detail)
- Use `AnimatedListItem` for staggered list entry animations
- Use Tamagui tokens (`$color`, `$accent`, `$3`, etc.) for all spacing and color
- Use `Pressable` from React Native for tappable elements (not Tamagui `Button`)

---

## Step 4: Add Screen & Navigation

Screens are Expo Router file-based routes in `app/`. They connect hooks to components.

### 4a. Create the route file

```ts
// app/todos.tsx
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';

import { Page } from '../src/components/page/page.tsx';
import { TodoList } from '../src/components/todo-list/todo-list.tsx';
import { useToolQuery } from '../src/hooks/use-tools.ts';

const TodosScreen = () => {
  const router = useRouter();
  const { data, refetch, isLoading } = useToolQuery('todo.list', {});
  const tasks = data?.result.tasks ?? [];

  const handleSelect = useCallback(
    (id: string) => {
      router.push(`/todo/${id}`);
    },
    [router],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Page title="Todos" variant="large">
        <TodoList tasks={tasks} onSelect={handleSelect} onRefresh={refetch} isLoading={isLoading} />
      </Page>
    </>
  );
};

export default TodosScreen;
```

### 4b. Add navigation entry point

If this is a tab, add it to the tab layout (`app/(tabs)/_layout.tsx`). If it's a stack route, link to it from an existing screen using `router.push('/todos')`.

### 4c. Dynamic detail routes

For detail screens, create a dynamic route file:

```
app/todo/[id].tsx    →  matches /todo/abc-123
```

Use `useLocalSearchParams` to read the route parameter:

```ts
import { useLocalSearchParams } from 'expo-router';

const TodoDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useToolQuery('todo.list', { /* fetch specific task */ });
  // ...
};
```

---

## Quick Reference

| What | Where | Pattern |
|---|---|---|
| Plugin tools | `packages/{pkg}/src/tools/` | `createTool()` with Zod schemas |
| API tool array | `packages/{pkg}/src/tools/tools.ts` | `const fooApiTools: Tool[] = [...]` |
| Tool registration | `packages/{pkg}/src/plugin/plugin.ts` | `toolRegistry.registerTools(tools)` in `setup()` |
| Type generation | `apps/expo/scripts/generate-tool-types.ts` | `pnpm generate` |
| Snapshot | `apps/expo/tools.snapshot.json` | Committed — enables offline codegen |
| Generated types | `apps/expo/src/generated/tools.ts` | Committed — eslint-ignored |
| Components | `apps/expo/src/components/{name}/` | Presentational + `.stories.tsx` |
| Screens | `apps/expo/app/` | Expo Router file-based routes |
| Hooks | `apps/expo/src/hooks/` | `useToolQuery` (reads), `useToolInvoke` (writes) |
| Storybook | `pnpm --filter @morten-olsen/agentic-expo storybook` | Stories auto-discovered from `src/components/**/*.stories.tsx` |

## Checklist

- [ ] Plugin tools exported as `{name}ApiTools` array from package
- [ ] Tools registered via `ToolRegistry` in plugin's `setup()` hook
- [ ] `tools.snapshot.json` updated (run codegen against server or edit manually)
- [ ] `src/generated/tools.ts` regenerated
- [ ] Components created with props-driven API (no direct data fetching)
- [ ] Storybook stories cover key states (populated, empty, loading)
- [ ] Screen route added in `app/`
- [ ] Navigation wired (tab entry, push from parent screen, or both)
- [ ] Both snapshot and generated types committed
