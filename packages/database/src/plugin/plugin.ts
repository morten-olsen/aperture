import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { DatabaseService } from '../database/database.service.js';
import { promptStoreDatabase } from '../prompt-store/prompt-store.database.js';
import { PromptStoreService } from '../prompt-store/prompt-store.service.js';
import { DatabaseConfig } from '../config/config.js';

type DatabasePluginOptions = {
  location: string;
};

const createDatabasePlugin = (options: DatabasePluginOptions) =>
  createPlugin({
    id: 'database',
    state: z.unknown(),
    setup: async ({ services }) => {
      const databaseConfig = services.get(DatabaseConfig);
      databaseConfig.location = options.location;
      const databaseService = services.get(DatabaseService);
      await databaseService.get(promptStoreDatabase);
      const promptStore = services.get(PromptStoreService);
      promptStore.listen();
    },
  });

export { createDatabasePlugin };
