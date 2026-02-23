import { createPlugin, ToolRegistry } from '@morten-olsen/agentic-core';
import { z } from 'zod';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { SkillService } from '@morten-olsen/agentic-skill';

import { secretsDatabase, connectionsDatabase } from '../database/database.js';
import { SecretsProviderDatabase } from '../secrets/secrets.database.js';
import { secretTools, connectionTools } from '../tools/tools.js';

const connectionPlugin = createPlugin({
  id: 'connection',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(secretsDatabase);
    await databaseService.get(connectionsDatabase);

    services.secrets = new SecretsProviderDatabase(services);

    const toolRegistry = services.get(ToolRegistry);
    toolRegistry.registerTools([...secretTools, ...connectionTools]);

    const skillService = services.get(SkillService);
    skillService.registerSkill({
      id: 'configuration',
      description:
        'Manage secrets and connections. Activate this skill to store API keys, tokens, and configure external service connections.',
      instruction: [
        'You are helping the user manage their secrets and connections.',
        '',
        'Secrets are sensitive values (API keys, tokens, passwords) stored securely. You can create, list, update, and delete them.',
        'Never display secret values in full — only confirm operations by name/ID.',
        '',
        'Connections represent configured external services. Each connection has a type that defines its fields.',
        'Some fields reference secrets by ID — these are resolved automatically when the connection is used.',
        '',
        'Use configuration.connections.types to see available connection types before creating connections.',
      ].join('\n'),
      tools: [...secretTools, ...connectionTools],
    });
  },
});

export { connectionPlugin };
