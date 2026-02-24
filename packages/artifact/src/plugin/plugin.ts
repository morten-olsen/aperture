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
  config: z.unknown(),
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
        const artifactService = services.get(ArtifactService);
        return await artifactService.get(id);
      },
    });
    interpreterService.expose({
      name: 'storeArtifact',
      description: 'Store data as an artifact. Returns the artifact ID. `storeArtifact(data, "description")`',
      fn: async (data: unknown, description?: string) => {
        const { ArtifactService } = await import('../service/service.js');
        const artifactService = services.get(ArtifactService);
        return await artifactService.add({
          type: 'code-output',
          description: description ?? '',
          data,
        });
      },
    });
    interpreterService.expose({
      name: 'listArtifacts',
      description: 'List stored artifacts. Returns [{id, type, description, createdAt}].',
      fn: async () => {
        const { ArtifactService } = await import('../service/service.js');
        const artifactService = services.get(ArtifactService);
        return await artifactService.list();
      },
    });
  },
  prepare: async ({ tools }) => {
    tools.push(artifactTools.get);
    tools.push(artifactTools.store);
    tools.push(artifactTools.list);
  },
});

export { artifactPlugin };
