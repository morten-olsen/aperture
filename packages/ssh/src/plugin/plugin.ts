import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { SkillService } from '@morten-olsen/agentic-skill';
import { z } from 'zod';

import { sshPluginOptionsSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { SshService } from '../service/service.js';
import { sshTools } from '../tools/tools.js';

const sshPlugin = createPlugin({
  id: 'ssh',
  config: sshPluginOptionsSchema,
  state: z.unknown(),
  setup: async ({ config, services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);

    const service = services.get(SshService);
    service.configure(config);

    const skillService = services.get(SkillService);
    skillService.registerSkill({
      id: 'ssh',
      description:
        'Execute commands on remote hosts via SSH with per-user host configs, allow/deny rules, and auto-generated key pairs.',
      instruction: [
        'You can execute commands on remote hosts using the ssh.* tools.',
        'First call ssh.show-public-key to get the public key and have the user add it to their servers.',
        'Use ssh.add-host to register hosts, ssh.add-rule to set allow/deny rules.',
        'Denied commands are blocked outright. Unmatched commands require human approval.',
      ].join('\n'),
      tools: sshTools,
    });
  },
});

export { sshPlugin };
