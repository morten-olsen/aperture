import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { ToolCallCard } from './ToolCallCard.tsx';

const meta: Meta<typeof ToolCallCard> = {
  component: ToolCallCard,
};

type Story = StoryObj<typeof ToolCallCard>;

const Collapsed: Story = {
  args: {
    data: {
      type: 'tool_call',
      function: 'search_files',
      input: { query: '*.tsx', path: '/src' },
    },
  },
};

const WithResult: Story = {
  args: {
    data: {
      type: 'tool_call',
      function: 'read_file',
      input: { path: '/src/index.ts' },
      result: { content: 'export const main = () => {}' },
    },
  },
};

export { Collapsed, WithResult };
export default meta;
