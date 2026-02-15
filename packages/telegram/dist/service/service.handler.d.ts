import type { Services } from '@morten-olsen/agentic-core';
import type { TelegramPluginOptions } from '../schemas/schemas.js';
type MessageMeta = {
    chatType: string;
    title?: string;
    username?: string;
    firstName?: string;
};
declare class TelegramMessageHandler {
    #private;
    constructor(services: Services, options: TelegramPluginOptions, completions: Map<string, string>);
    handle: (telegramChatId: string, text: string, meta: MessageMeta) => void;
}
export { TelegramMessageHandler };
//# sourceMappingURL=service.handler.d.ts.map