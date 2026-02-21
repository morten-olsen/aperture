import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { TodoList } from './todo-list.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
    <Story />
  </YStack>
);

const meta: Meta<typeof TodoList> = {
  title: 'Screens/Todo List',
  component: TodoList,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof TodoList>;

const now = Date.now();

const sampleTasks = [
  {
    id: 'task-1',
    title: 'Buy groceries',
    status: 'pending' as const,
    priority: 'medium' as const,
    position: 0,
    createdAt: new Date(now - 86_400_000).toISOString(),
    updatedAt: new Date(now - 3_600_000).toISOString(),
    tags: ['personal'],
  },
  {
    id: 'task-2',
    title: 'Write unit tests',
    status: 'in_progress' as const,
    priority: 'high' as const,
    position: 1,
    project: 'Backend',
    createdAt: new Date(now - 172_800_000).toISOString(),
    updatedAt: new Date(now - 7_200_000).toISOString(),
    tags: ['work'],
  },
  {
    id: 'task-3',
    title: 'Submit PR',
    status: 'completed' as const,
    priority: 'medium' as const,
    position: 2,
    completedAt: new Date(now - 1_800_000).toISOString(),
    createdAt: new Date(now - 259_200_000).toISOString(),
    updatedAt: new Date(now - 1_800_000).toISOString(),
    tags: [],
  },
  {
    id: 'task-4',
    title: 'Deploy hotfix',
    status: 'pending' as const,
    priority: 'urgent' as const,
    position: 3,
    dueAt: new Date(now - 7_200_000).toISOString(),
    createdAt: new Date(now - 43_200_000).toISOString(),
    updatedAt: new Date(now - 43_200_000).toISOString(),
    tags: ['work', 'urgent'],
  },
];

const WithTasks: Story = {
  args: {
    tasks: sampleTasks,
    onSelect: () => undefined,
    onToggleComplete: () => undefined,
    onRefresh: () => undefined,
  },
};

const Empty: Story = {
  args: {
    tasks: [],
    onSelect: () => undefined,
    onToggleComplete: () => undefined,
    onRefresh: () => undefined,
  },
};

const Refreshing: Story = {
  args: {
    tasks: sampleTasks.slice(0, 2),
    onSelect: () => undefined,
    onToggleComplete: () => undefined,
    onRefresh: () => undefined,
    isRefreshing: true,
  },
};

export { WithTasks, Empty, Refreshing };
export default meta;
