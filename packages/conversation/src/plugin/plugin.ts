import { randomUUID } from 'node:crypto';

import { createPlugin, EventService, ToolRegistry } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';
import { notificationPublishedEvent } from '@morten-olsen/agentic-notification';

import { conversationDatabase } from '../database/database.js';
import { allConversationEvents } from '../events/events.js';
import { ConversationService } from '../service/service.js';
import { conversationApiTools } from '../tools/tools.js';

const conversationPlugin = createPlugin({
  id: 'conversation',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(conversationDatabase);
    const toolRegistry = services.get(ToolRegistry);
    toolRegistry.registerTools(conversationApiTools);
    const eventService = services.get(EventService);
    eventService.registerEvent(...allConversationEvents);
    const conversationService = services.get(ConversationService);
    eventService.listen(notificationPublishedEvent, async (notification) => {
      conversationService.insertIntoActive({
        id: randomUUID(),
        userId: notification.userId,
        model: 'normal',
        state: 'completed',
        output: [
          {
            type: 'text',
            content: notification.body,
            start: new Date().toISOString(),
          },
        ],
      });
    });
  },
});

export { conversationPlugin };
