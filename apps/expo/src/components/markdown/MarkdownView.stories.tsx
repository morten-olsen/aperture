import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { MarkdownView } from './MarkdownView.tsx';

const meta: Meta<typeof MarkdownView> = {
  component: MarkdownView,
};

type Story = StoryObj<typeof MarkdownView>;

const Default: Story = {
  args: {
    content: '# Hello World\n\nThis is a **markdown** paragraph with `inline code`.',
  },
};

export { Default };
export default meta;
