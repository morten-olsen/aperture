import type { Meta, StoryObj } from '@storybook/react';

import { ToolCallGroup } from './tool-call-card.tsx';

const meta: Meta<typeof ToolCallGroup> = {
  title: 'Chat/Tool Call Group',
  component: ToolCallGroup,
};

type Story = StoryObj<typeof ToolCallGroup>;

const SingleTool: Story = {
  args: {
    tools: [
      {
        type: 'tool',
        function: 'read_file',
        input: { path: '/src/index.ts' },
        result: { content: 'export const main = () => {}' },
      },
    ],
  },
};

const MultiplePending: Story = {
  args: {
    tools: [
      {
        type: 'tool',
        function: 'search_files',
        input: { query: '*.tsx', path: '/src' },
      },
      {
        type: 'tool',
        function: 'read_file',
        input: { path: '/src/app.tsx' },
      },
    ],
  },
};

const MultipleCompleted: Story = {
  args: {
    tools: [
      {
        type: 'tool',
        function: 'read_file',
        input: { path: '/src/auth/auth.service.ts' },
        result: { content: 'export class AuthService { ... }' },
      },
      {
        type: 'tool',
        function: 'read_file',
        input: { path: '/src/auth/auth.middleware.ts' },
        result: { content: 'export const authMiddleware = ...' },
      },
      {
        type: 'tool',
        function: 'write_file',
        input: { path: '/src/auth/auth.tokens.ts', content: '...' },
        result: { success: true },
      },
    ],
  },
};

export { SingleTool, MultiplePending, MultipleCompleted };
export default meta;
