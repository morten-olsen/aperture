import { Bot } from 'gramio';
import { toTelegramMarkdown } from './service.markdown.js';
import { splitMessage } from './service.split.js';
class TelegramBotService {
    #bot;
    #options;
    get bot() {
        if (!this.#bot) {
            throw new Error('TelegramBotService not started');
        }
        return this.#bot;
    }
    get options() {
        if (!this.#options) {
            throw new Error('TelegramBotService not started');
        }
        return this.#options;
    }
    start = (token, options) => {
        this.#options = options;
        this.#bot = new Bot(token);
        this.#bot.start();
    };
    stop = () => {
        this.#bot?.stop();
        this.#bot = undefined;
    };
    sendMessage = async (chatId, text) => {
        const bot = this.bot;
        const chunks = splitMessage(text);
        for (const chunk of chunks) {
            try {
                const markdown = toTelegramMarkdown(chunk);
                await bot.api.sendMessage({
                    chat_id: chatId,
                    text: markdown,
                    parse_mode: 'MarkdownV2',
                });
            }
            catch {
                await bot.api.sendMessage({
                    chat_id: chatId,
                    text: chunk,
                });
            }
        }
    };
}
export { TelegramBotService };
//# sourceMappingURL=service.bot.js.map