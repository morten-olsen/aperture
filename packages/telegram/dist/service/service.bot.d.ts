import { Bot } from 'gramio';
import type { TelegramPluginOptions } from '../schemas/schemas.js';
declare class TelegramBotService {
    #private;
    get bot(): Bot<{}, import("gramio").DeriveDefinitions>;
    get options(): TelegramPluginOptions;
    start: (token: string, options: TelegramPluginOptions) => void;
    stop: () => void;
    sendMessage: (chatId: string, text: string) => Promise<void>;
}
export { TelegramBotService };
//# sourceMappingURL=service.bot.d.ts.map