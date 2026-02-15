import { z } from 'zod';
declare const telegramChatTypeSchema: z.ZodEnum<{
    private: "private";
    group: "group";
    supergroup: "supergroup";
    channel: "channel";
}>;
type TelegramChatType = z.infer<typeof telegramChatTypeSchema>;
declare const telegramChatSchema: z.ZodObject<{
    id: z.ZodString;
    telegramChatId: z.ZodString;
    chatType: z.ZodEnum<{
        private: "private";
        group: "group";
        supergroup: "supergroup";
        channel: "channel";
    }>;
    title: z.ZodNullable<z.ZodString>;
    username: z.ZodNullable<z.ZodString>;
    firstName: z.ZodNullable<z.ZodString>;
    model: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
type TelegramChat = z.infer<typeof telegramChatSchema>;
declare const telegramSendMessageInputSchema: z.ZodObject<{
    text: z.ZodString;
}, z.core.$strip>;
type TelegramSendMessageInput = z.infer<typeof telegramSendMessageInputSchema>;
declare const telegramSetModelInputSchema: z.ZodObject<{
    model: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
type TelegramSetModelInput = z.infer<typeof telegramSetModelInputSchema>;
declare const telegramListChatsOutputSchema: z.ZodObject<{
    chats: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        telegramChatId: z.ZodString;
        chatType: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
type TelegramListChatsOutput = z.infer<typeof telegramListChatsOutputSchema>;
declare const telegramStateSchema: z.ZodObject<{
    chat: z.ZodObject<{
        id: z.ZodString;
        telegramChatId: z.ZodString;
        chatType: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        username: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
type TelegramState = z.infer<typeof telegramStateSchema>;
type TelegramPluginOptions = {
    token: string;
    defaultModel: string;
    allowedChatIds?: string[];
};
export { telegramChatTypeSchema, telegramChatSchema, telegramSendMessageInputSchema, telegramSetModelInputSchema, telegramListChatsOutputSchema, telegramStateSchema, };
export type { TelegramChatType, TelegramChat, TelegramSendMessageInput, TelegramSetModelInput, TelegramListChatsOutput, TelegramState, TelegramPluginOptions, };
//# sourceMappingURL=schemas.d.ts.map