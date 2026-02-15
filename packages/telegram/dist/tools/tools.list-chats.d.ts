import { z } from 'zod';
declare const listChats: import("@morten-olsen/agentic-core").Tool<z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    chats: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        telegramChatId: z.ZodString;
        chatType: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export { listChats };
//# sourceMappingURL=tools.list-chats.d.ts.map