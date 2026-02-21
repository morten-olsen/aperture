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

const NewButton = () => (
  <XStack backgroundColor="$accent" paddingHorizontal="$3" paddingVertical="$1.5" borderRadius="$full">
    <Text fontSize={14} fontWeight="600" color="$accentText">
      New
    </Text>
  </XStack>
);

const LargeTitle: Story = {
  render: () => (
    <Page title="Conversations">
      <SampleContent />
    </Page>
  ),
};

const LargeTitleWithBack: Story = {
  render: () => (
    <Page title="Settings" onBack={() => undefined}>
      <SampleContent />
    </Page>
  ),
};

const LargeTitleWithActions: Story = {
  render: () => (
    <Page title="Conversations" rightAction={<NewButton />}>
      <SampleContent />
    </Page>
  ),
};

const InlineTitle: Story = {
  render: () => (
    <Page title="Conversation" variant="inline" onBack={() => undefined}>
      <SampleContent />
    </Page>
  ),
};

export { LargeTitle, LargeTitleWithBack, LargeTitleWithActions, InlineTitle };
export default meta;
