import type { Services } from '@morten-olsen/agentic-core';
import type { TelegramChat } from '../schemas/schemas.js';
type TelegramChatRow = {
    id: string;
    telegram_chat_id: string;
    chat_type: string;
    title: string | null;
    username: string | null;
    first_name: string | null;
    model: string | null;
    created_at: string;
    updated_at: string;
};
declare class TelegramChatRepo {
    #private;
    constructor(services: Services);
    upsert: (chat: Omit<TelegramChat, "createdAt" | "updatedAt">) => Promise<void>;
    get: (id: string) => Promise<TelegramChat | undefined>;
    getByTelegramId: (telegramChatId: string) => Promise<TelegramChat | undefined>;
    list: () => Promise<TelegramChat[]>;
    updateModel: (id: string, model: string | null) => Promise<void>;
}
export { TelegramChatRepo };
export type { TelegramChatRow };
//# sourceMappingURL=repo.d.ts.map