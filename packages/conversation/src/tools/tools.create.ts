import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationCreateTool = createTool({
  id: 'conversation.create',
  description: 'Create a new conversation',
  input: z.object({
    userId: z.string().describe('User ID who owns the conversation'),
  }),
  output: z.object({
    id: z.string(),
  }),
  invoke: async ({ input, services }) => {
    const { ConversationService } = await import('../service/service.js');
    const conversationService = services.get(ConversationService);
    const conversation = await conversationService.create({ userId: input.userId });
    return { id: conversation.id };
  },
});

export { conversationCreateTool };
