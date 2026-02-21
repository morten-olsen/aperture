import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { TodoListItem } from './todo-list-item.tsx';

const meta: Meta<typeof TodoListItem> = {
  component: TodoListItem,
};

type Story = StoryObj<typeof TodoListItem>;

const now = Date.now();

const baseTask = {
  id: 'task-1',
  title: 'Buy groceries',
  status: 'pending' as const,
  priority: 'medium' as const,
  position: 0,
  createdAt: new Date(now - 86_400_000).toISOString(),
  updatedAt: new Date(now - 3_600_000).toISOString(),
  tags: [],
};

const Pending: Story = {
  args: {
    task: baseTask,
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

const InProgress: Story = {
  args: {
    task: { ...baseTask, id: 'task-2', title: 'Write unit tests', status: 'in_progress' },
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

const Completed: Story = {
  args: {
    task: {
      ...baseTask,
      id: 'task-3',
      title: 'Submit PR',
      status: 'completed',
      completedAt: new Date(now - 1_800_000).toISOString(),
    },
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

const HighPriority: Story = {
  args: {
    task: { ...baseTask, id: 'task-4', title: 'Fix production bug', priority: 'high' },
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

const UrgentOverdue: Story = {
  args: {
    task: {
      ...baseTask,
      id: 'task-5',
      title: 'Deploy hotfix',
      priority: 'urgent',
      dueAt: new Date(now - 7_200_000).toISOString(),
    },
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

const WithProject: Story = {
  args: {
    task: { ...baseTask, id: 'task-6', title: 'Design new landing page', project: 'Website Redesign' },
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

const LongTitle: Story = {
  args: {
    task: {
      ...baseTask,
      id: 'task-7',
      title: 'This is a very long task title that should be truncated in the user interface to prevent overflow',
    },
    onPress: fn(),
    onToggleComplete: fn(),
  },
};

export { Pending, InProgress, Completed, HighPriority, UrgentOverdue, WithProject, LongTitle };
export default meta;
