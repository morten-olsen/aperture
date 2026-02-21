import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { XStack, YStack, Text, Square } from 'tamagui';

const Swatch = ({ name, token }: { name: string; token: string }) => (
  <YStack alignItems="center" gap="$1" width={80}>
    <Square size={48} borderRadius="$3" backgroundColor={token} borderWidth={1} borderColor="$borderSubtle" />
    <Text fontSize="$1" color="$colorSubtle" textAlign="center">
      {name}
    </Text>
  </YStack>
);

const SwatchGroup = ({ title, swatches }: { title: string; swatches: { name: string; token: string }[] }) => (
  <YStack gap="$2">
    <Text fontWeight="600" fontSize="$4">
      {title}
    </Text>
    <XStack flexWrap="wrap" gap="$3">
      {swatches.map((s) => (
        <Swatch key={s.name} name={s.name} token={s.token} />
      ))}
    </XStack>
  </YStack>
);

const grayScale = Array.from({ length: 12 }, (_, i) => ({
  name: `gray${i + 1}`,
  token: `$gray${i + 1}`,
}));

const semanticColors = [
  { name: 'accent', token: '$accent' },
  { name: 'accentSurface', token: '$accentSurface' },
  { name: 'success', token: '$success' },
  { name: 'successSurface', token: '$successSurface' },
  { name: 'warning', token: '$warning' },
  { name: 'warningSurface', token: '$warningSurface' },
  { name: 'danger', token: '$danger' },
  { name: 'dangerSurface', token: '$dangerSurface' },
];

const chatColors = [
  { name: 'chatUser', token: '$chatUser' },
  { name: 'chatAssistant', token: '$chatAssistant' },
  { name: 'chatAssistantBorder', token: '$chatAssistantBorder' },
  { name: 'chatTool', token: '$chatTool' },
  { name: 'chatToolBorder', token: '$chatToolBorder' },
];

const surfaceColors = [
  { name: 'surface', token: '$surface' },
  { name: 'surfaceHover', token: '$surfaceHover' },
  { name: 'surfaceRaised', token: '$surfaceRaised' },
  { name: 'surfaceRaisedHover', token: '$surfaceRaisedHover' },
];

const ColorTokens = () => (
  <YStack padding="$4" gap="$6">
    <Text fontSize="$8" fontWeight="600">
      Color Tokens
    </Text>
    <SwatchGroup title="Gray Scale" swatches={grayScale} />
    <SwatchGroup title="Surfaces" swatches={surfaceColors} />
    <SwatchGroup title="Semantic" swatches={semanticColors} />
    <SwatchGroup title="Chat" swatches={chatColors} />
  </YStack>
);

const meta: Meta = {
  title: 'Tokens/Colors',
  component: ColorTokens,
};

type Story = StoryObj;

const Default: Story = {};

export { Default };
export default meta;
