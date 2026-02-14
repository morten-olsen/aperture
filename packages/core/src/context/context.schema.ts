import { z } from 'zod';

const contextItemSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  content: z.string(),
});

type ContextItem = z.input<typeof contextItemSchema>;

const contextSchema = z.object({
  items: z.array(contextItemSchema),
});

type Context = z.input<typeof contextSchema>;

export type { ContextItem, Context };
export { contextItemSchema, contextSchema };
