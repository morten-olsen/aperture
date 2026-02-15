import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { telegramSetModelInputSchema } from '../schemas/schemas.js';

const createSetModelTool = (chatId: string) =>
  createTool({
    id: 'telegram.setModel',
    description: 'Change the AI model used for this Telegram chat. Set to null to use the default model.',
    input: telegramSetModelInputSchema,
    output: z.object({
      success: z.boolean(),
    }),
    invoke: async ({ input, services }) => {
      const { TelegramChatRepo } = await import('../repo/repo.js');
      const repo = new TelegramChatRepo(services);
      await repo.updateModel(chatId, input.model);
      return { success: true };
    },
  });

export { createSetModelTool };
