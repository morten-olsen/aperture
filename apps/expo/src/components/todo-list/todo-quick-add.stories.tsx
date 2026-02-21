import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { TodoQuickAdd } from './todo-quick-add.tsx';

const meta: Meta<typeof TodoQuickAdd> = {
  component: TodoQuickAdd,
};

type Story = StoryObj<typeof TodoQuickAdd>;

const Default: Story = {
  args: {
    onAdd: fn(),
  },
};

const Adding: Story = {
  args: {
    onAdd: fn(),
    isAdding: true,
  },
};

export { Default, Adding };
export default meta;
