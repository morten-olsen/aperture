import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { XStack, YStack, Text, Square } from 'tamagui';

const radii = [
  { name: 'badge', token: '$badge' as const },
  { name: 'button / input', token: '$button' as const },
  { name: 'card', token: '$card' as const },
  { name: 'full', token: '$full' as const },
];

const RadiiTokens = () => (
  <YStack padding="$4" gap="$4">
    <Text fontSize="$8" fontWeight="600">
      Border Radii
    </Text>
    <XStack gap="$4" flexWrap="wrap">
      {radii.map(({ name, token }) => (
        <YStack key={name} alignItems="center" gap="$2">
          <Square size={64} backgroundColor="$accent" borderRadius={token} />
          <Text fontSize="$3" fontWeight="600">
            {name}
          </Text>
          <Text fontSize="$2" color="$colorMuted">
            {token}
          </Text>
        </YStack>
      ))}
    </XStack>
  </YStack>
);

const meta: Meta = {
  title: 'Tokens/Radii',
  component: RadiiTokens,
};

type Story = StoryObj;

const Default: Story = {};

export { Default };
export default meta;
