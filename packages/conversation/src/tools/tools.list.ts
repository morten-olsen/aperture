import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationListTool = createTool({
  id: 'conversation.list',
  description: 'List conversations for a user',
  input: z.object({
    userId: z.string().describe('User ID to list conversations for'),
  }),
  output: z.object({
    conversations: z.array(
      z.object({
        id: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  invoke: async ({ input, services }) => {
    const { ConversationService } = await import('../service/service.js');
    const conversationService = services.get(ConversationService);
    const rows = await conversationService.list(input.userId);
    return {
      conversations: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  },
});

export { conversationListTool };
