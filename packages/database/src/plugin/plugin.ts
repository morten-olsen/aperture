import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { DatabaseService } from '../database/database.service.js';
import { EmbeddingConfig } from '../embedding/embedding.config.js';
import { promptStoreDatabase } from '../prompt-store/prompt-store.database.js';
import { PromptStoreService } from '../prompt-store/prompt-store.service.js';
import { DatabaseConfig } from '../config/config.js';

const databasePluginOptionsSchema = z.object({
  location: z.string(),
  embeddings: z
    .object({
      provider: z.enum(['openai', 'local']),
      model: z.string(),
      dimensions: z.number(),
    })
    .optional(),
});

const databasePlugin = createPlugin({
  id: 'database',
  config: databasePluginOptionsSchema,
  state: z.unknown(),
  setup: async ({ config, services }) => {
    const databaseConfig = services.get(DatabaseConfig);
    databaseConfig.location = config.location;
    if (config.embeddings) {
      const embeddingConfig = services.get(EmbeddingConfig);
      embeddingConfig.provider = config.embeddings.provider;
      embeddingConfig.model = config.embeddings.model;
      embeddingConfig.dimensions = config.embeddings.dimensions;
    }
    const databaseService = services.get(DatabaseService);
    await databaseService.get(promptStoreDatabase);
    const promptStore = services.get(PromptStoreService);
    promptStore.listen();
  },
});

export { databasePlugin, databasePluginOptionsSchema };
