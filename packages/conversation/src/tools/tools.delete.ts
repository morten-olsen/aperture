import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationDeleteTool = createTool({
  id: 'conversation.delete',
  description: 'Delete a conversation',
  input: z.object({
    id: z.string().describe('Conversation ID to delete'),
    userId: z.string().describe('User ID'),
  }),
  output: z.object({
    deleted: z.boolean(),
  }),
  invoke: async ({ input, services }) => {
    const { ConversationService } = await import('../service/service.js');
    const conversationService = services.get(ConversationService);
    await conversationService.delete(input.id);
    return { deleted: true };
  },
});

export { conversationDeleteTool };
