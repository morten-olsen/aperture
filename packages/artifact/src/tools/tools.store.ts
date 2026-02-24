import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { ArtifactService } from '../service/service.js';

const storeTool = createTool({
  id: 'artifact.store',
  description: 'Store data as an artifact for later retrieval. Returns the artifact ID.',
  input: z.object({
    type: z.string(),
    description: z.string().optional(),
    data: z.unknown(),
  }),
  output: z.object({ id: z.string() }),
  invoke: async ({ input, services }) => {
    const artifactService = services.get(ArtifactService);
    const id = await artifactService.add({
      type: input.type,
      description: input.description ?? undefined,
      data: input.data,
    });
    return { id };
  },
});

export { storeTool };
