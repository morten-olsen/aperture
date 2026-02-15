import { ConversationService } from '@morten-olsen/agentic-conversation';
import { TelegramChatRepo } from '../repo/repo.js';
import { TelegramBotService } from './service.bot.js';
class TelegramMessageHandler {
    #services;
    #options;
    #completions;
    #queues = new Map();
    constructor(services, options, completions) {
        this.#services = services;
        this.#options = options;
        this.#completions = completions;
    }
    #enqueue = (chatId, fn) => {
        const prev = this.#queues.get(chatId) ?? Promise.resolve();
        const next = prev.then(fn, fn);
        this.#queues.set(chatId, next);
    };
    #processMessage = async (telegramChatId, text, meta) => {
        const chatId = `telegram:${telegramChatId}`;
        const repo = new TelegramChatRepo(this.#services);
        await repo.upsert({
            id: chatId,
            telegramChatId: String(telegramChatId),
            chatType: meta.chatType,
            title: meta.title ?? null,
            username: meta.username ?? null,
            firstName: meta.firstName ?? null,
            model: null,
        });
        const chat = await repo.get(chatId);
        const model = chat?.model ?? this.#options.defaultModel;
        const conversationService = this.#services.get(ConversationService);
        const conversation = await conversationService.get(chatId);
        const completion = await conversation.prompt({
            input: text,
            model,
            state: {
                telegram: {
                    chat: {
                        id: chatId,
                        telegramChatId: String(telegramChatId),
                        chatType: meta.chatType,
                        title: meta.title,
                        username: meta.username,
                    },
                },
            },
        });
        this.#completions.set(completion.id, telegramChatId);
        try {
            await completion.run();
        }
        catch (error) {
            console.error('[Telegram] Error running completion:', error);
            this.#completions.delete(completion.id);
            try {
                const botService = this.#services.get(TelegramBotService);
                await botService.sendMessage(telegramChatId, 'Sorry, something went wrong.');
            }
            catch (sendError) {
                console.error('[Telegram] Error sending error message:', sendError);
            }
        }
    };
    handle = (telegramChatId, text, meta) => {
        this.#enqueue(telegramChatId, async () => {
            try {
                await this.#processMessage(telegramChatId, text, meta);
            }
            catch (error) {
                console.error('[Telegram] Error processing message:', error);
                try {
                    const botService = this.#services.get(TelegramBotService);
                    await botService.sendMessage(telegramChatId, 'Sorry, something went wrong.');
                }
                catch (sendError) {
                    console.error('[Telegram] Error sending error message:', sendError);
                }
            }
        });
    };
}
export { TelegramMessageHandler };
//# sourceMappingURL=service.handler.js.map