import type { Meta, StoryObj } from '@storybook/react';

import { ChatMessage } from './chat-message.tsx';

const meta: Meta<typeof ChatMessage> = {
  component: ChatMessage,
};

type Story = StoryObj<typeof ChatMessage>;

const UserMessage: Story = {
  args: {
    data: {
      type: 'message',
      role: 'user',
      content: 'Hello, can you help me with something?',
    },
  },
};

const AssistantMessage: Story = {
  args: {
    data: {
      type: 'message',
      role: 'assistant',
      content: 'Of course! I would be happy to help. What do you need?',
    },
  },
};

export { UserMessage, AssistantMessage };
export default meta;
