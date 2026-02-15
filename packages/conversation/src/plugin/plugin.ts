import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { conversationDatabase } from '../database/database.js';

const conversationPlugin = createPlugin({
  id: 'conversation',
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(conversationDatabase);
  },
});

export { conversationPlugin };
