import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { LoginScreen } from './login-screen.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack flex={1}>
    <Story />
  </YStack>
);

const meta: Meta<typeof LoginScreen> = {
  title: 'Screens/Login',
  component: LoginScreen,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof LoginScreen>;

const Empty: Story = {
  args: {
    serverUrl: '',
    onServerUrlChange: () => undefined,
    userId: '',
    onUserIdChange: () => undefined,
    password: '',
    onPasswordChange: () => undefined,
    onConnect: () => undefined,
  },
};

const Filled: Story = {
  args: {
    serverUrl: 'http://localhost:3000/api',
    onServerUrlChange: () => undefined,
    userId: 'alice',
    onUserIdChange: () => undefined,
    password: 'hunter2',
    onPasswordChange: () => undefined,
    onConnect: () => undefined,
  },
};

const Connecting: Story = {
  args: {
    serverUrl: 'http://localhost:3000/api',
    onServerUrlChange: () => undefined,
    userId: 'alice',
    onUserIdChange: () => undefined,
    password: 'hunter2',
    onPasswordChange: () => undefined,
    onConnect: () => undefined,
    isConnecting: true,
  },
};

export { Empty, Filled, Connecting };
export default meta;
