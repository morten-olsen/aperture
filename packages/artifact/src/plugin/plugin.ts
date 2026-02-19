import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { InterpreterService } from '@morten-olsen/agentic-interpreter';
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
    const interpreterService = services.get(InterpreterService);
    interpreterService.expose({
      name: 'getArtifact',
      description: 'Get an artifact by id `getArtifact("artifact-id")`',
      fn: async (id: string) => {
        const { ArtifactService } = await import('../service/service.js');
        const artifaceService = services.get(ArtifactService);
        return await artifaceService.get(id);
      },
    });
  },
  prepare: async ({ tools }) => {
    tools.push(artifactTools.get);
  },
});

export { artifactPlugin };
