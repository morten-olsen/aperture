import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import type { ShellPluginOptions } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { ShellService } from '../service/service.js';
import { shellTools } from '../tools/tools.js';

const createShellPlugin = (options: ShellPluginOptions = {}) => {
  return createPlugin({
    id: 'shell',
    state: z.unknown(),
    setup: async ({ services }) => {
      const databaseService = services.get(DatabaseService);
      await databaseService.get(database);

      const service = services.get(ShellService);
      service.configure(options);
    },
    prepare: async ({ tools }) => {
      tools.push(...shellTools);
    },
  });
};

export { createShellPlugin };
