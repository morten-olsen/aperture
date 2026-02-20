import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { database } from '../database/database.js';
import { PersonalityRepo } from '../repo/repo.js';
import { personalityTools } from '../tools/tools.js';

const personalityPlugin = createPlugin({
  id: 'personality',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);
  },
  prepare: async ({ tools, context, services, userId }) => {
    tools.push(...personalityTools);

    const repo = new PersonalityRepo(services);
    const personality = await repo.get(userId);

    if (personality) {
      context.items.push({
        type: 'personality',
        content: personality.content,
      });
    }
  },
});

export { personalityPlugin };
