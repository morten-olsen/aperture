import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { ArtifactService } from '../service/service.js';

const listTool = createTool({
  id: 'artifact.list',
  description: 'List all stored artifacts with their metadata (without data)',
  input: z.object({}),
  output: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      description: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  invoke: async ({ services }) => {
    const artifactService = services.get(ArtifactService);
    return await artifactService.list();
  },
});

export { listTool };
