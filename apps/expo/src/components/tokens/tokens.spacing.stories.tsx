import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { config } from '@tamagui/config/v3';
import { XStack, YStack, Text, View } from 'tamagui';

const spaceTokens = Object.entries(config.tokens.space)
  .filter(([key]) => /^\d+$/.test(key))
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([key, value]) => ({ key: `$${key}`, px: Number(value) }));

const SpacingTokens = () => (
  <YStack padding="$4" gap="$4">
    <Text fontSize="$8" fontWeight="600">
      Spacing
    </Text>
    <YStack gap="$3">
      {spaceTokens.map(({ key, px }) => (
        <XStack key={key} alignItems="center" gap="$3">
          <Text fontSize="$3" width={40} textAlign="right" color="$colorSubtle">
            {key}
          </Text>
          <View height={16} width={px} backgroundColor="$accent" borderRadius="$2" />
          <Text fontSize="$2" color="$colorMuted">
            {px}px
          </Text>
        </XStack>
      ))}
    </YStack>
  </YStack>
);

const meta: Meta = {
  title: 'Tokens/Spacing',
  component: SpacingTokens,
};

type Story = StoryObj;

const Default: Story = {};

export { Default };
export default meta;
