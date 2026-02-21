import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack, Text } from 'tamagui';

const TypographyRow = ({
  label,
  fontSize,
  fontWeight,
  fontFamily,
}: {
  label: string;
  fontSize: string;
  fontWeight?: string;
  fontFamily?: string;
}) => (
  <YStack gap="$1" paddingVertical="$2" borderBottomWidth={1} borderBottomColor="$borderSubtle">
    <Text fontSize="$2" color="$colorMuted">
      {label} — size: {fontSize}
      {fontWeight ? `, weight: ${fontWeight}` : ''}
      {fontFamily ? `, family: ${fontFamily}` : ''}
    </Text>
    <Text fontSize={fontSize as never} fontWeight={fontWeight as never} fontFamily={fontFamily as never}>
      The quick brown fox jumps over the lazy dog
    </Text>
  </YStack>
);

const TypographyTokens = () => (
  <YStack padding="$4" gap="$4">
    <Text fontSize="$8" fontWeight="600">
      Typography
    </Text>
    <TypographyRow label="Caption" fontSize="$3" fontWeight="400" />
    <TypographyRow label="Body" fontSize="$4" fontWeight="400" />
    <TypographyRow label="Body (semibold)" fontSize="$4" fontWeight="600" />
    <TypographyRow label="Large body" fontSize="$6" fontWeight="400" />
    <TypographyRow label="Heading small" fontSize="$6" fontWeight="600" />
    <TypographyRow label="Heading large" fontSize="$8" fontWeight="600" />
    <TypographyRow label="Code" fontSize="$3" fontFamily="$mono" />
  </YStack>
);

const meta: Meta = {
  title: 'Tokens/Typography',
  component: TypographyTokens,
};

type Story = StoryObj;

const Default: Story = {};

export { Default };
export default meta;
