import type { Meta, StoryObj } from '@storybook/react';

import { StreamingIndicator } from './streaming-indicator.tsx';

const meta: Meta<typeof StreamingIndicator> = {
  component: StreamingIndicator,
};

type Story = StoryObj<typeof StreamingIndicator>;

const Default: Story = {};

export { Default };
export default meta;
