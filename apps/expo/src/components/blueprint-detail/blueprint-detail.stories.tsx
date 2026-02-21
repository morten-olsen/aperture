import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { BlueprintDetail } from './blueprint-detail.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
    <Story />
  </YStack>
);

const meta: Meta<typeof BlueprintDetail> = {
  title: 'Screens/Blueprint Detail',
  component: BlueprintDetail,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof BlueprintDetail>;

const now = Date.now();

const FullBlueprint: Story = {
  args: {
    blueprint: {
      id: 'bp-1',
      title: 'Morning standup summary',
      use_case: 'When the user asks for a standup update each morning',
      process:
        "1. Check calendar for today's meetings\n2. Review yesterday's completed tasks\n3. List today's planned tasks\n4. Flag any blockers",
      notes: 'User prefers bullet-point format. Keep it under 200 words.',
      created_at: new Date(now - 604_800_000).toISOString(),
      updated_at: new Date(now - 3_600_000).toISOString(),
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

const MinimalBlueprint: Story = {
  args: {
    blueprint: {
      id: 'bp-2',
      title: 'Quick task',
      use_case: 'Generic fallback',
      process: 'Just do it.',
      notes: null,
      created_at: new Date(now - 86_400_000).toISOString(),
      updated_at: new Date(now - 86_400_000).toISOString(),
    },
    onUpdate: () => undefined,
    onDelete: () => undefined,
  },
};

export { FullBlueprint, MinimalBlueprint };
export default meta;
