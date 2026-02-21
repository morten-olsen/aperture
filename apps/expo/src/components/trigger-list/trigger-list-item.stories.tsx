import type { Meta, StoryObj } from '@storybook/react';

import { TriggerListItem } from './trigger-list-item.tsx';

const meta: Meta<typeof TriggerListItem> = {
  component: TriggerListItem,
};

type Story = StoryObj<typeof TriggerListItem>;

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
    onPress: () => undefined,
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
    onPress: () => undefined,
  },
};

const Completed: Story = {
  args: {
    trigger: {
      id: 'trg-3',
      name: 'One-time backup check',
      scheduleType: 'once',
      scheduleValue: new Date(now - 7_200_000).toISOString(),
      status: 'completed',
      invocationCount: 1,
      nextInvocationAt: null,
      lastInvokedAt: new Date(now - 7_200_000).toISOString(),
    },
    onPress: () => undefined,
  },
};

const Failed: Story = {
  args: {
    trigger: {
      id: 'trg-4',
      name: 'Broken webhook sync',
      scheduleType: 'cron',
      scheduleValue: '*/30 * * * *',
      status: 'failed',
      invocationCount: 5,
      nextInvocationAt: null,
      lastInvokedAt: new Date(now - 1_800_000).toISOString(),
    },
    onPress: () => undefined,
  },
};

export { ActiveCron, PausedOnce, Completed, Failed };
export default meta;
