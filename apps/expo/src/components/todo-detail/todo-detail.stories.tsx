import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { TodoDetail } from './todo-detail.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
    <Story />
  </YStack>
);

const meta: Meta<typeof TodoDetail> = {
  title: 'Screens/Todo Detail',
  component: TodoDetail,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof TodoDetail>;

const now = Date.now();

const PendingTask: Story = {
  args: {
    task: {
      id: 'task-1',
      title: 'Buy groceries',
      description: 'Milk, eggs, bread, and some fruit for the week.',
      status: 'pending',
      priority: 'medium',
      position: 0,
      project: 'Personal',
      dueAt: new Date(now + 86_400_000).toISOString(),
      createdAt: new Date(now - 86_400_000).toISOString(),
      updatedAt: new Date(now - 3_600_000).toISOString(),
      tags: ['shopping', 'weekly'],
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const CompletedTask: Story = {
  args: {
    task: {
      id: 'task-2',
      title: 'Submit PR',
      description: 'Final review done, ready to merge.',
      status: 'completed',
      priority: 'medium',
      position: 1,
      project: 'Backend',
      completedAt: new Date(now - 1_800_000).toISOString(),
      createdAt: new Date(now - 259_200_000).toISOString(),
      updatedAt: new Date(now - 1_800_000).toISOString(),
      tags: ['work'],
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const UrgentWithDetails: Story = {
  args: {
    task: {
      id: 'task-3',
      title: 'Deploy hotfix for auth regression',
      description:
        'Users are getting 403 errors after the last deployment. Need to rollback the auth middleware change and redeploy.',
      status: 'in_progress',
      priority: 'urgent',
      position: 0,
      project: 'Platform',
      dueAt: new Date(now - 7_200_000).toISOString(),
      createdAt: new Date(now - 43_200_000).toISOString(),
      updatedAt: new Date(now - 600_000).toISOString(),
      tags: ['critical', 'production', 'auth'],
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const MinimalTask: Story = {
  args: {
    task: {
      id: 'task-4',
      title: 'Quick note',
      status: 'pending',
      priority: 'low',
      position: 0,
      createdAt: new Date(now - 3_600_000).toISOString(),
      updatedAt: new Date(now - 3_600_000).toISOString(),
      tags: [],
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

export { PendingTask, CompletedTask, UrgentWithDetails, MinimalTask };
export default meta;
