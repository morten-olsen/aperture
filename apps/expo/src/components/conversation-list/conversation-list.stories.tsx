import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { ConversationList } from './conversation-list.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack flex={1}>
    <Story />
  </YStack>
);

const meta: Meta<typeof ConversationList> = {
  title: 'Screens/Conversation List',
  component: ConversationList,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof ConversationList>;

const now = Date.now();

const WithConversations: Story = {
  args: {
    conversations: [
      {
        id: 'refactor-auth-module',
        createdAt: new Date(now - 120_000).toISOString(),
        updatedAt: new Date(now - 120_000).toISOString(),
      },
      {
        id: 'debug-sse-connection',
        createdAt: new Date(now - 3_600_000).toISOString(),
        updatedAt: new Date(now - 3_600_000).toISOString(),
      },
      {
        id: 'plan-v2-architecture',
        createdAt: new Date(now - 86_400_000).toISOString(),
        updatedAt: new Date(now - 86_400_000).toISOString(),
      },
      {
        id: 'write-unit-tests',
        createdAt: new Date('2026-02-10T14:00:00Z').toISOString(),
        updatedAt: new Date('2026-02-10T14:00:00Z').toISOString(),
      },
    ],
    onSelect: () => undefined,
    onRefresh: () => undefined,
  },
};

const Empty: Story = {
  args: {
    conversations: [],
    onSelect: () => undefined,
    onRefresh: () => undefined,
  },
};

const Refreshing: Story = {
  args: {
    conversations: [
      {
        id: 'abc-123',
        createdAt: new Date(now - 60_000).toISOString(),
        updatedAt: new Date(now - 60_000).toISOString(),
      },
    ],
    onSelect: () => undefined,
    onRefresh: () => undefined,
    isRefreshing: true,
  },
};

export { WithConversations, Empty, Refreshing };
export default meta;
