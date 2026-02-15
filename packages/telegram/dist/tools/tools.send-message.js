import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';
import { telegramSendMessageInputSchema } from '../schemas/schemas.js';
const createSendMessageTool = (chatId) => createTool({
    id: 'telegram.sendMessage',
    description: 'Send an additional message to the current Telegram chat.',
    input: telegramSendMessageInputSchema,
    output: z.object({
        success: z.boolean(),
    }),
    invoke: async ({ input, services }) => {
        const { TelegramBotService } = await import('../service/service.bot.js');
        const botService = services.get(TelegramBotService);
        await botService.sendMessage(chatId, input.text);
        return { success: true };
    },
});
export { createSendMessageTool };
//# sourceMappingURL=tools.send-message.js.map