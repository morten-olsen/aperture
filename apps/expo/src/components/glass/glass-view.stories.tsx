import type { Meta, StoryObj } from '@storybook/react';
import { YStack, Text } from 'tamagui';

import { GlassView } from './glass-view.tsx';

const meta: Meta<typeof GlassView> = {
  component: GlassView,
  decorators: [
    (Story) => (
      <YStack padding="$5" gap="$4">
        <Story />
      </YStack>
    ),
  ],
};

type Story = StoryObj<typeof GlassView>;

const Subtle: Story = {
  render: () => (
    <GlassView intensity="subtle" borderRadius={24} padding={20}>
      <Text fontSize={16} color="$color">
        Subtle glass intensity — used for tool cards, list items, and inactive buttons.
      </Text>
    </GlassView>
  ),
};

const Medium: Story = {
  render: () => (
    <GlassView intensity="medium" borderRadius={24} padding={20}>
      <Text fontSize={16} color="$color">
        Medium glass intensity — used for login forms, assistant chat bubbles.
      </Text>
    </GlassView>
  ),
};

const Strong: Story = {
  render: () => (
    <GlassView intensity="strong" borderRadius={24} padding={20}>
      <Text fontSize={16} color="$color">
        Strong glass intensity — used for headers, input bars, approval banners.
      </Text>
    </GlassView>
  ),
};

const AllIntensities: Story = {
  render: () => (
    <YStack gap="$4">
      {(['subtle', 'medium', 'strong'] as const).map((level) => (
        <GlassView key={level} intensity={level} borderRadius={24} padding={20}>
          <Text fontSize={16} fontWeight="600" color="$color">
            {level}
          </Text>
          <Text fontSize={14} color="$colorSubtle">
            Glass surface with {level} intensity
          </Text>
        </GlassView>
      ))}
    </YStack>
  ),
};

export { Subtle, Medium, Strong, AllIntensities };
export default meta;
