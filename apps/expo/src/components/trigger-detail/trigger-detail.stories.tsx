import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { TriggerDetail } from './trigger-detail.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
    <Story />
  </YStack>
);

const meta: Meta<typeof TriggerDetail> = {
  title: 'Screens/Trigger Detail',
  component: TriggerDetail,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof TriggerDetail>;

const now = Date.now();

const ActiveCron: Story = {
  args: {
    trigger: {
      id: 'trg-1',
      name: 'Morning standup digest',
      scheduleType: 'cron',
      scheduleValue: '0 9 * * 1-5',
      status: 'active',
      invocationCount: 12,
      nextInvocationAt: new Date(now + 3_600_000).toISOString(),
      lastInvokedAt: new Date(now - 86_400_000).toISOString(),
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const PausedOnce: Story = {
  args: {
    trigger: {
      id: 'trg-2',
      name: 'Deploy reminder',
      scheduleType: 'once',
      scheduleValue: new Date(now + 86_400_000).toISOString(),
      status: 'paused',
      invocationCount: 0,
      nextInvocationAt: new Date(now + 86_400_000).toISOString(),
      lastInvokedAt: null,
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const FailedTrigger: Story = {
  args: {
    trigger: {
      id: 'trg-3',
      name: 'Broken webhook sync',
      scheduleType: 'cron',
      scheduleValue: '*/30 * * * *',
      status: 'failed',
      invocationCount: 5,
      nextInvocationAt: null,
      lastInvokedAt: new Date(now - 1_800_000).toISOString(),
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const CompletedOnce: Story = {
  args: {
    trigger: {
      id: 'trg-4',
      name: 'One-time backup check',
      scheduleType: 'once',
      scheduleValue: new Date(now - 7_200_000).toISOString(),
      status: 'completed',
      invocationCount: 1,
      nextInvocationAt: null,
      lastInvokedAt: new Date(now - 7_200_000).toISOString(),
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

export { ActiveCron, PausedOnce, FailedTrigger, CompletedOnce };
export default meta;
