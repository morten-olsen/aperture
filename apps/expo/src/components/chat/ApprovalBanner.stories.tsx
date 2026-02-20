import { action } from '@storybook/addon-actions';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { ApprovalBanner } from './ApprovalBanner.tsx';

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
    onApprove: action('approve'),
    onReject: action('reject'),
  },
};

export { Default };
export default meta;
