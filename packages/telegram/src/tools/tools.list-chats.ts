import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { telegramListChatsOutputSchema } from '../schemas/schemas.js';

const listChats = createTool({
  id: 'telegram.listChats',
  description: 'List all Telegram chats the bot has interacted with.',
  input: z.object({}),
  output: telegramListChatsOutputSchema,
  invoke: async ({ services }) => {
    const { TelegramChatRepo } = await import('../repo/repo.js');
    const repo = new TelegramChatRepo(services);
    const chats = await repo.list();
    return {
      chats: chats.map((chat) => ({
        id: chat.id,
        telegramChatId: chat.telegramChatId,
        chatType: chat.chatType,
        title: chat.title,
        username: chat.username,
      })),
    };
  },
});

export { listChats };
