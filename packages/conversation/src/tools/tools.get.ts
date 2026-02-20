import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationGetTool = createTool({
  id: 'conversation.get',
  description: 'Get a conversation by ID including its prompt history',
  input: z.object({
    id: z.string().describe('Conversation ID'),
    userId: z.string().describe('User ID'),
  }),
  output: z.object({
    id: z.string(),
    prompts: z.array(z.unknown()),
  }),
  invoke: async ({ input, services }) => {
    const { ConversationService } = await import('../service/service.js');
    const conversationService = services.get(ConversationService);
    const conversation = await conversationService.get(input.id, input.userId);
    return {
      id: conversation.id,
      prompts: conversation.prompts,
    };
  },
});

export { conversationGetTool };
