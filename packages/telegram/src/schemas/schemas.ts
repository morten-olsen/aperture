import { z } from 'zod';

const telegramChatTypeSchema = z.enum(['private', 'group', 'supergroup', 'channel']);

type TelegramChatType = z.infer<typeof telegramChatTypeSchema>;

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

type TelegramChat = z.infer<typeof telegramChatSchema>;

const telegramSendMessageInputSchema = z.object({
  text: z.string().describe('The message text to send to the Telegram chat'),
});

type TelegramSendMessageInput = z.infer<typeof telegramSendMessageInputSchema>;

const telegramSetModelInputSchema = z.object({
  model: z.string().nullable().describe('Model ID to use for this chat, or null to clear the override'),
});

type TelegramSetModelInput = z.infer<typeof telegramSetModelInputSchema>;

const telegramListChatsOutputSchema = z.object({
  chats: z.array(
    z.object({
      id: z.string(),
      telegramChatId: z.string(),
      chatType: z.string(),
      title: z.string().nullable(),
      username: z.string().nullable(),
    }),
  ),
});

type TelegramListChatsOutput = z.infer<typeof telegramListChatsOutputSchema>;

const telegramStateSchema = z.object({
  chat: z.object({
    id: z.string(),
    telegramChatId: z.string(),
    chatType: z.string(),
    title: z.string().optional(),
    username: z.string().optional(),
  }),
});

type TelegramState = z.infer<typeof telegramStateSchema>;

type TelegramPluginOptions = {
  token: string;
  defaultModel: string;
  allowedChatIds?: string[];
};

export {
  telegramChatTypeSchema,
  telegramChatSchema,
  telegramSendMessageInputSchema,
  telegramSetModelInputSchema,
  telegramListChatsOutputSchema,
  telegramStateSchema,
};

export type {
  TelegramChatType,
  TelegramChat,
  TelegramSendMessageInput,
  TelegramSetModelInput,
  TelegramListChatsOutput,
  TelegramState,
  TelegramPluginOptions,
};
