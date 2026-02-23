import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationSetActiveTool = createTool({
  id: 'conversation.setActive',
  description: "Set the user's active conversation",
  input: z.object({
    conversationId: z.string().nullable().describe('Conversation ID to set as active, or null to clear'),
    userId: z.string().describe('User ID'),
  }),
  output: z.object({
    success: z.boolean(),
  }),
  invoke: async ({ input, services }) => {
    const { ConversationService } = await import('../service/service.js');
    const conversationService = services.get(ConversationService);
    await conversationService.setActive(input.conversationId, input.userId);
    return { success: true };
  },
});

export { conversationSetActiveTool };
