import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { TriggerList } from './trigger-list.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
    <Story />
  </YStack>
);

const meta: Meta<typeof TriggerList> = {
  title: 'Screens/Trigger List',
  component: TriggerList,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof TriggerList>;

const now = Date.now();

const sampleTriggers = [
  {
    id: 'trg-1',
    name: 'Morning standup digest',
    scheduleType: 'cron',
    scheduleValue: '0 9 * * 1-5',
    status: 'active',
    invocationCount: 12,
    nextInvocationAt: new Date(now + 3_600_000).toISOString(),
    lastInvokedAt: new Date(now - 86_400_000).toISOString(),
  },
  {
    id: 'trg-2',
    name: 'Weekly report generation',
    scheduleType: 'cron',
    scheduleValue: '0 17 * * 5',
    status: 'active',
    invocationCount: 4,
    nextInvocationAt: new Date(now + 259_200_000).toISOString(),
    lastInvokedAt: new Date(now - 604_800_000).toISOString(),
  },
  {
    id: 'trg-3',
    name: 'One-time deploy reminder',
    scheduleType: 'once',
    scheduleValue: new Date(now - 7_200_000).toISOString(),
    status: 'completed',
    invocationCount: 1,
    nextInvocationAt: null,
    lastInvokedAt: new Date(now - 7_200_000).toISOString(),
  },
  {
    id: 'trg-4',
    name: 'Broken webhook sync',
    scheduleType: 'cron',
    scheduleValue: '*/30 * * * *',
    status: 'failed',
    invocationCount: 5,
    nextInvocationAt: null,
    lastInvokedAt: new Date(now - 1_800_000).toISOString(),
  },
];

const WithTriggers: Story = {
  args: {
    triggers: sampleTriggers,
    onSelect: () => undefined,
    onRefresh: () => undefined,
  },
};

const Empty: Story = {
  args: {
    triggers: [],
    onSelect: () => undefined,
    onRefresh: () => undefined,
  },
};

const Refreshing: Story = {
  args: {
    triggers: sampleTriggers.slice(0, 2),
    onSelect: () => undefined,
    onRefresh: () => undefined,
    isRefreshing: true,
  },
};

export { WithTriggers, Empty, Refreshing };
export default meta;
