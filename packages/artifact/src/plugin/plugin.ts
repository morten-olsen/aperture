import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { database } from '../database/database.js';
import { artifactTools } from '../tools/tools.js';

const artifactPlugin = createPlugin({
  id: 'artifact',
  name: 'Artifact',
  description: 'Stores and retrieves large structured data produced by tools',
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);
  },
  prepare: async ({ tools }) => {
    tools.push(artifactTools.get);
  },
});

export { artifactPlugin };
