import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack, Text, XStack } from 'tamagui';

import { Page } from './page.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack flex={1}>
    <Story />
  </YStack>
);

const meta: Meta<typeof Page> = {
  title: 'Components/Page',
  component: Page,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof Page>;

const SampleContent = () => (
  <YStack flex={1} paddingHorizontal="$5" paddingTop="$4" gap="$4">
    {Array.from({ length: 5 }, (_, i) => (
      <YStack key={i} padding="$4" backgroundColor="$chatTool" borderRadius="$card" gap="$2">
        <Text fontSize={16} fontWeight="600">
          Item {i + 1}
        </Text>
        <Text fontSize={15} color="$colorSubtle" lineHeight={22}>
          This is a sample list item to demonstrate the page layout and spacing.
        </Text>
      </YStack>
    ))}
  </YStack>
);

const LargeTitle: Story = {
  args: {
    title: 'Conversations',
    children: React.createElement(SampleContent),
  },
};

const LargeTitleWithBack: Story = {
  args: {
    title: 'Settings',
    onBack: () => undefined,
    children: React.createElement(SampleContent),
  },
};

const LargeTitleWithActions: Story = {
  args: {
    title: 'Conversations',
    rightAction: React.createElement(
      XStack,
      {
        backgroundColor: '$accent',
        paddingHorizontal: '$3',
        paddingVertical: '$1.5',
        borderRadius: '$full',
      },
      React.createElement(Text, { fontSize: 14, fontWeight: '600', color: '$accentText' }, 'New'),
    ),
    children: React.createElement(SampleContent),
  },
};

const InlineTitle: Story = {
  args: {
    title: 'Conversation',
    variant: 'inline',
    onBack: () => undefined,
    children: React.createElement(SampleContent),
  },
};

export { LargeTitle, LargeTitleWithBack, LargeTitleWithActions, InlineTitle };
export default meta;
