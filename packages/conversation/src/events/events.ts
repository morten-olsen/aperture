import { createEvent } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const conversationUpdatedEvent = createEvent({
  id: 'conversation.updated',
  schema: z.object({
    conversationId: z.string(),
    title: z.string().nullable(),
  }),
});

const allConversationEvents = [conversationUpdatedEvent];

export { conversationUpdatedEvent, allConversationEvents };
