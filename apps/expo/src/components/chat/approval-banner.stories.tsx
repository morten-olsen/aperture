import type { Meta, StoryObj } from '@storybook/react';

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
    onApprove: () => undefined,
    onReject: () => undefined,
  },
};

export { Default };
export default meta;
