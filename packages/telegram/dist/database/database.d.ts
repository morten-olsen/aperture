import { z } from 'zod';
declare const database: import("@morten-olsen/agentic-database").Database<{
    telegram_chats: z.ZodObject<{
        id: z.ZodString;
        telegram_chat_id: z.ZodString;
        chat_type: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        username: z.ZodNullable<z.ZodString>;
        first_name: z.ZodNullable<z.ZodString>;
        model: z.ZodNullable<z.ZodString>;
        created_at: z.ZodString;
        updated_at: z.ZodString;
    }, z.core.$strip>;
}>;
export { database };
//# sourceMappingURL=database.d.ts.map