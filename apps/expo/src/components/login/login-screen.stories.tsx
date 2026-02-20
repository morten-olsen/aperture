import React from 'react';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { YStack } from 'tamagui';

import { LoginScreen } from './login-screen.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
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
    onServerUrlChange: fn(),
    userId: '',
    onUserIdChange: fn(),
    password: '',
    onPasswordChange: fn(),
    onConnect: fn(),
  },
};

const Filled: Story = {
  args: {
    serverUrl: 'http://localhost:3000/api',
    onServerUrlChange: fn(),
    userId: 'alice',
    onUserIdChange: fn(),
    password: 'hunter2',
    onPasswordChange: fn(),
    onConnect: fn(),
  },
};

const Connecting: Story = {
  args: {
    serverUrl: 'http://localhost:3000/api',
    onServerUrlChange: fn(),
    userId: 'alice',
    onUserIdChange: fn(),
    password: 'hunter2',
    onPasswordChange: fn(),
    onConnect: fn(),
    isConnecting: true,
  },
};

export { Empty, Filled, Connecting };
export default meta;
