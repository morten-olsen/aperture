import { randomUUID } from 'node:crypto';

import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';
import { NotificationService } from '@morten-olsen/agentic-notification';

import { conversationDatabase } from '../database/database.js';
import { ConversationService } from '../service/service.js';

const conversationPlugin = createPlugin({
  id: 'conversation',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(conversationDatabase);
    const notificationService = services.get(NotificationService);
    const conversationService = services.get(ConversationService);
    notificationService.on('published', async (notification) => {
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
