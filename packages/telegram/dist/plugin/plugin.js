import { createPlugin, PromptService } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { telegramStateSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { TelegramBotService } from '../service/service.bot.js';
import { TelegramMessageHandler } from '../service/service.handler.js';
import { standardTools, createChatTools } from '../tools/tools.js';
const createTelegramPlugin = (options) => createPlugin({
    id: 'telegram',
    state: telegramStateSchema,
    setup: async ({ services }) => {
        const databaseService = services.get(DatabaseService);
        await databaseService.get(database);
        const botService = services.get(TelegramBotService);
        botService.start(options.token, options);
        const telegramCompletions = new Map();
        const promptService = services.get(PromptService);
        promptService.on('created', (completion) => {
            completion.on('completed', async () => {
                const chatId = telegramCompletions.get(completion.id);
                if (!chatId)
                    return;
                telegramCompletions.delete(completion.id);
                const textParts = completion.prompt.output
                    .filter((o) => o.type === 'text')
                    .map((o) => o.content)
                    .filter(Boolean);
                const responseText = textParts.join('\n\n');
                if (responseText) {
                    try {
                        await botService.sendMessage(chatId, responseText);
                    }
                    catch (error) {
                        console.error('[Telegram] Error sending response:', error);
                    }
                }
            });
        });
        const handler = new TelegramMessageHandler(services, options, telegramCompletions);
        botService.bot.on('message', (ctx) => {
            const text = ctx.text;
            if (!text)
                return;
            const telegramChatId = String(ctx.chat.id);
            if (options.allowedChatIds && !options.allowedChatIds.includes(telegramChatId)) {
                return;
            }
            handler.handle(telegramChatId, text, {
                chatType: ctx.chat.type,
                title: 'title' in ctx.chat ? ctx.chat.title : undefined,
                username: ctx.from?.username,
                firstName: ctx.from?.firstName,
            });
        });
    },
    prepare: async ({ tools, context, state }) => {
        const telegramState = state.getState(telegramPlugin);
        if (!telegramState?.chat) {
            tools.push(...standardTools);
            return;
        }
        const { chat } = telegramState;
        tools.push(...createChatTools(chat.telegramChatId));
        const parts = [`You are chatting with a user via Telegram (${chat.chatType} chat).`];
        if (chat.username) {
            parts.push(`Username: ${chat.username}`);
        }
        if (chat.title) {
            parts.push(`Chat title: ${chat.title}`);
        }
        context.items.push({
            type: 'telegram-context',
            content: parts.join('\n'),
        });
    },
});
const telegramPlugin = createTelegramPlugin({
    token: '',
    defaultModel: '',
});
export { createTelegramPlugin, telegramPlugin };
//# sourceMappingURL=plugin.js.map