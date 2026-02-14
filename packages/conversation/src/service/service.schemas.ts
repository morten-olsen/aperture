import { promptSchema } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationCreateInputSchema = z.object({
  id: z.string().optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  history: z.array(promptSchema).optional(),
});

type ConversationCreateInput = z.input<typeof conversationCreateInputSchema>;

export type { ConversationCreateInput };
export { conversationCreateInputSchema };
