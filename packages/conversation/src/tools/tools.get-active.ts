import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationGetActiveTool = createTool({
  id: 'conversation.getActive',
  description: "Get the user's currently active conversation",
  input: z.object({
    userId: z.string().describe('User ID'),
  }),
  output: z
    .object({
      id: z.string(),
      prompts: z.array(z.unknown()),
    })
    .nullable(),
  invoke: async ({ input, services }) => {
    const { ConversationService } = await import('../service/service.js');
    const conversationService = services.get(ConversationService);
    const conversation = await conversationService.getActive(input.userId);
    if (!conversation) {
      return null;
    }
    return {
      id: conversation.id,
      prompts: conversation.prompts,
    };
  },
});

export { conversationGetActiveTool };
