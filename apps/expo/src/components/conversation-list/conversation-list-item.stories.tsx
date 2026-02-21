import type { Meta, StoryObj } from '@storybook/react';

import { ConversationListItem } from './conversation-list-item.tsx';

const meta: Meta<typeof ConversationListItem> = {
  component: ConversationListItem,
};

type Story = StoryObj<typeof ConversationListItem>;

const Recent: Story = {
  args: {
    id: 'abc-123-def',
    updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    onPress: () => undefined,
  },
};

const Old: Story = {
  args: {
    id: 'project-planning-session',
    updatedAt: new Date('2026-01-15T10:30:00Z').toISOString(),
    onPress: () => undefined,
  },
};

const LongId: Story = {
  args: {
    id: 'this-is-a-really-long-conversation-identifier-that-should-be-truncated-in-the-ui',
    updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    onPress: () => undefined,
  },
};

export { Recent, Old, LongId };
export default meta;
