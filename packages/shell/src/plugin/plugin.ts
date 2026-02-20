import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { SkillService } from '@morten-olsen/agentic-skill';
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

      const skillService = services.get(SkillService);
      skillService.registerSkill({
        id: 'shell',
        description: 'Execute local shell commands with per-user allow/deny rules.',
        instruction: [
          'You can execute local shell commands using the shell.* tools.',
          'Only commands matching an allowed pattern can run freely.',
          'Denied patterns are blocked outright. Unmatched commands require human approval.',
          'Use shell.list-rules to see current rules and shell.add-rule to add new ones.',
        ].join('\n'),
        tools: shellTools,
      });
    },
  });
};

export { createShellPlugin };
