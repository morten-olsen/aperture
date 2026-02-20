import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { database } from '../database/database.js';
import { LocationService } from '../service/service.js';

const locationPlugin = createPlugin({
  id: 'location',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);
  },
  prepare: async ({ context, services, userId }) => {
    const locationService = services.get(LocationService);
    const latest = await locationService.getLatest(userId);

    if (latest) {
      context.items.push({
        type: 'current-location',
        content: `User location: lat=${latest.latitude}, lng=${latest.longitude} (captured at ${latest.captured_at})`,
      });
    }
  },
});

export { locationPlugin };
