import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { YStack } from 'tamagui';

import { Page } from '../page/page.tsx';

import { ChatConversation } from './chat-conversation.tsx';
import type { ChatEntry } from './chat-conversation.tsx';

const FullScreen = (Story: React.ComponentType) => (
  <YStack height="100vh">
    <Story />
  </YStack>
);

const WithPage = (Story: React.ComponentType) => (
  <Page title="Conversation" variant="inline" onBack={() => undefined}>
    <Story />
  </Page>
);

const meta: Meta<typeof ChatConversation> = {
  title: 'Screens/Chat Conversation',
  component: ChatConversation,
  decorators: [WithPage, FullScreen],
};

type Story = StoryObj<typeof ChatConversation>;

const basicConversation: ChatEntry[] = [
  { type: 'text', role: 'user', content: 'Can you help me refactor the authentication module?' },
  {
    type: 'text',
    role: 'assistant',
    content:
      "Sure! Let me take a look at the current implementation first. I'll read the relevant files to understand the structure.",
  },
  {
    type: 'tool',
    function: 'read_file',
    input: { path: '/src/auth/auth.service.ts' },
    result: { content: 'export class AuthService { ... }' },
  },
  {
    type: 'tool',
    function: 'read_file',
    input: { path: '/src/auth/auth.middleware.ts' },
    result: { content: 'export const authMiddleware = ...' },
  },
  {
    type: 'text',
    role: 'assistant',
    content:
      "I can see the auth module has two main files. The service handles token validation and the middleware checks requests. Here's what I'd suggest:\n\n1. Extract the token logic into a separate utility\n2. Add proper error types instead of generic errors\n3. Use dependency injection for the token store\n\nWant me to go ahead with these changes?",
  },
  { type: 'text', role: 'user', content: 'Yes, go ahead!' },
  {
    type: 'tool',
    function: 'write_file',
    input: { path: '/src/auth/auth.tokens.ts', content: '...' },
  },
  {
    type: 'text',
    role: 'assistant',
    content:
      "Done! I've extracted the token utilities into a new file and updated both the service and middleware to use it. The error handling is now type-safe with dedicated error classes.",
  },
];

const Conversation: Story = {
  args: {
    messages: basicConversation,
    onSend: () => undefined,
  },
};

const streamingMessages: ChatEntry[] = [
  { type: 'text', role: 'user', content: 'What files are in the src directory?' },
  {
    type: 'tool',
    function: 'list_directory',
    input: { path: '/src' },
  },
];

const Streaming: Story = {
  args: {
    messages: streamingMessages,
    isStreaming: true,
    onSend: () => undefined,
  },
};

const approvalMessages: ChatEntry[] = [
  { type: 'text', role: 'user', content: 'Delete all the temporary test files' },
  {
    type: 'text',
    role: 'assistant',
    content: "I'll remove the temporary test fixtures. Let me delete them one by one.",
  },
];

const PendingApproval: Story = {
  args: {
    messages: approvalMessages,
    pendingApproval: {
      promptId: 'prompt-1',
      toolCallId: 'tc-42',
      toolName: 'delete_file',
      input: { path: '/src/__fixtures__/temp-data.json' },
      reason: 'This action will permanently delete a file',
    },
    onSend: () => undefined,
    onApprove: () => undefined,
    onReject: () => undefined,
  },
};

const errorMessages: ChatEntry[] = [
  { type: 'text', role: 'user', content: 'Connect to the production database' },
  {
    type: 'text',
    role: 'assistant',
    content: "I'll try to establish a connection to the production database now.",
  },
];

const WithError: Story = {
  args: {
    messages: errorMessages,
    error: 'Connection refused: unable to reach database at prod-db.internal:5432',
    onSend: () => undefined,
  },
};

const Empty: Story = {
  args: {
    messages: [],
    onSend: () => undefined,
  },
};

export { Conversation, Streaming, PendingApproval, WithError, Empty };
export default meta;
