import type { Meta, StoryObj } from '@storybook/react';

import { BlueprintListItem } from './blueprint-list-item.tsx';

const meta: Meta<typeof BlueprintListItem> = {
  component: BlueprintListItem,
};

type Story = StoryObj<typeof BlueprintListItem>;

const Default: Story = {
  args: {
    blueprint: {
      id: 'bp-1',
      title: 'Morning standup summary',
      use_case: 'When the user asks for a standup update each morning',
    },
    onPress: () => undefined,
  },
};

const LongTitle: Story = {
  args: {
    blueprint: {
      id: 'bp-2',
      title: 'This is a very long blueprint title that should be truncated in the user interface to prevent overflow',
      use_case: 'When the user requests a comprehensive weekly report covering all projects and deliverables',
    },
    onPress: () => undefined,
  },
};

export { Default, LongTitle };
export default meta;
