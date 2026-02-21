import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { BlueprintList } from './blueprint-list.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack flex={1}>
    <Story />
  </YStack>
);

const meta: Meta<typeof BlueprintList> = {
  title: 'Screens/Blueprint List',
  component: BlueprintList,
  decorators: [FullScreen],
};

type Story = StoryObj<typeof BlueprintList>;

const sampleBlueprints = [
  {
    id: 'bp-1',
    title: 'Morning standup summary',
    use_case: 'When the user asks for a standup update each morning',
  },
  {
    id: 'bp-2',
    title: 'Weekly report generation',
    use_case: 'When the user requests a weekly summary on Fridays',
  },
  {
    id: 'bp-3',
    title: 'Code review checklist',
    use_case: 'When the user submits a PR for review',
  },
];

const WithBlueprints: Story = {
  args: {
    blueprints: sampleBlueprints,
    onSelect: () => undefined,
    onRefresh: () => undefined,
  },
};

const Empty: Story = {
  args: {
    blueprints: [],
    onSelect: () => undefined,
    onRefresh: () => undefined,
  },
};

const Refreshing: Story = {
  args: {
    blueprints: sampleBlueprints.slice(0, 1),
    onSelect: () => undefined,
    onRefresh: () => undefined,
    isRefreshing: true,
  },
};

export { WithBlueprints, Empty, Refreshing };
export default meta;
