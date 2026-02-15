import { z } from 'zod';
declare const createSendMessageTool: (chatId: string) => import("@morten-olsen/agentic-core").Tool<z.ZodObject<{
    text: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    success: z.ZodBoolean;
}, z.core.$strip>>;
export { createSendMessageTool };
//# sourceMappingURL=tools.send-message.d.ts.map