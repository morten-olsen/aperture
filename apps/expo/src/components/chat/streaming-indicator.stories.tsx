import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { StreamingIndicator } from './streaming-indicator.tsx';

const meta: Meta<typeof StreamingIndicator> = {
  component: StreamingIndicator,
};

type Story = StoryObj<typeof StreamingIndicator>;

const Default: Story = {};

export { Default };
export default meta;
