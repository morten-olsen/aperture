import type { Meta, StoryObj } from '@storybook/react';

import { TodoQuickAdd } from './todo-quick-add.tsx';

const meta: Meta<typeof TodoQuickAdd> = {
  component: TodoQuickAdd,
};

type Story = StoryObj<typeof TodoQuickAdd>;

const Default: Story = {
  args: {
    onAdd: () => undefined,
  },
};

const Adding: Story = {
  args: {
    onAdd: () => undefined,
    isAdding: true,
  },
};

export { Default, Adding };
export default meta;
