import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { artifactSchema } from '../schemas/schemas.js';
import { ArtifactService } from '../service/service.js';

const getTool = createTool({
  id: 'artifact.get',
  description: 'Retrieve the full data of an artifact by its ID',
  input: z.object({
    id: z.string(),
  }),
  output: artifactSchema,
  invoke: async ({ input, services }) => {
    const artifactService = services.get(ArtifactService);
    const artifact = await artifactService.get(input.id);
    if (!artifact) {
      throw new Error(`Artifact not found: ${input.id}`);
    }
    return artifact;
  },
});

export { getTool };
