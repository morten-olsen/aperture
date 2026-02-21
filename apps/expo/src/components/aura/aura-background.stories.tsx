import type { Meta, StoryObj } from '@storybook/react';
import { YStack, Text } from 'tamagui';

import { AuraBackground } from './aura-background.tsx';

const meta: Meta<typeof AuraBackground> = {
  component: AuraBackground,
  decorators: [
    (Story) => (
      <YStack backgroundColor="$backgroundBase" height={500} position="relative">
        <Story />
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$5">
          <Text fontSize={20} fontWeight="600" color="$color">
            Content over aura
          </Text>
          <Text fontSize={14} color="$colorSubtle">
            Glass panels float above these ambient orbs
          </Text>
        </YStack>
      </YStack>
    ),
  ],
};

type Story = StoryObj<typeof AuraBackground>;

const Default: Story = {
  args: {
    variant: 'default',
  },
};

const Login: Story = {
  args: {
    variant: 'login',
  },
};

const Chat: Story = {
  args: {
    variant: 'chat',
  },
};

export { Default, Login, Chat };
export default meta;
