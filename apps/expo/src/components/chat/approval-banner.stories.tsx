import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { ApprovalBanner } from './approval-banner.tsx';

const meta: Meta<typeof ApprovalBanner> = {
  component: ApprovalBanner,
};

type Story = StoryObj<typeof ApprovalBanner>;

const Default: Story = {
  args: {
    approval: {
      promptId: 'prompt-1',
      toolCallId: 'tc-1',
      toolName: 'write_file',
      input: { path: '/src/app.ts', content: '...' },
      reason: 'This tool modifies the filesystem',
    },
    onApprove: fn(),
    onReject: fn(),
  },
};

export { Default };
export default meta;
