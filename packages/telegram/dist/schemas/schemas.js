import { z } from 'zod';
const telegramChatTypeSchema = z.enum(['private', 'group', 'supergroup', 'channel']);
const telegramChatSchema = z.object({
    id: z.string(),
    telegramChatId: z.string(),
    chatType: telegramChatTypeSchema,
    title: z.string().nullable(),
    username: z.string().nullable(),
    firstName: z.string().nullable(),
    model: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
const telegramSendMessageInputSchema = z.object({
    text: z.string().describe('The message text to send to the Telegram chat'),
});
const telegramSetModelInputSchema = z.object({
    model: z.string().nullable().describe('Model ID to use for this chat, or null to clear the override'),
});
const telegramListChatsOutputSchema = z.object({
    chats: z.array(z.object({
        id: z.string(),
        telegramChatId: z.string(),
        chatType: z.string(),
        title: z.string().nullable(),
        username: z.string().nullable(),
    })),
});
const telegramStateSchema = z.object({
    chat: z.object({
        id: z.string(),
        telegramChatId: z.string(),
        chatType: z.string(),
        title: z.string().optional(),
        username: z.string().optional(),
    }),
});
export { telegramChatTypeSchema, telegramChatSchema, telegramSendMessageInputSchema, telegramSetModelInputSchema, telegramListChatsOutputSchema, telegramStateSchema, };
//# sourceMappingURL=schemas.js.map