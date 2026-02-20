import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { webFetchPluginOptionsSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { WebFetchService } from '../service/service.js';
import { webFetchTools } from '../tools/tools.js';

const webFetchPlugin = createPlugin({
  id: 'web-fetch',
  config: webFetchPluginOptionsSchema,
  state: z.unknown(),
  setup: async ({ config, services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);

    const service = services.get(WebFetchService);
    service.configure(config);
  },
  prepare: async ({ tools, context }) => {
    tools.push(...webFetchTools);

    context.items.push({
      type: 'web-fetch-context',
      content: [
        'You can fetch web pages using the web-fetch.* tools.',
        'Only domains on the allowlist can be fetched. Use web-fetch.list-domains to see allowed domains, and web-fetch.add-domain to add new ones before fetching.',
      ].join('\n'),
    });
  },
});

export { webFetchPlugin };
