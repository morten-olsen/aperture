import type { TelegramPluginOptions } from '../schemas/schemas.js';
declare const createTelegramPlugin: (options: TelegramPluginOptions) => import("@morten-olsen/agentic-core").Plugin<import("zod").ZodObject<{
    chat: import("zod").ZodObject<{
        id: import("zod").ZodString;
        telegramChatId: import("zod").ZodString;
        chatType: import("zod").ZodString;
        title: import("zod").ZodOptional<import("zod").ZodString>;
        username: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>;
}, import("zod/v4/core").$strip>>;
declare const telegramPlugin: import("@morten-olsen/agentic-core").Plugin<import("zod").ZodObject<{
    chat: import("zod").ZodObject<{
        id: import("zod").ZodString;
        telegramChatId: import("zod").ZodString;
        chatType: import("zod").ZodString;
        title: import("zod").ZodOptional<import("zod").ZodString>;
        username: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod/v4/core").$strip>;
}, import("zod/v4/core").$strip>>;
export { createTelegramPlugin, telegramPlugin };
//# sourceMappingURL=plugin.d.ts.map