import { z } from 'zod';
declare const createSetModelTool: (chatId: string) => import("@morten-olsen/agentic-core").Tool<z.ZodObject<{
    model: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    success: z.ZodBoolean;
}, z.core.$strip>>;
export { createSetModelTool };
//# sourceMappingURL=tools.set-model.d.ts.map