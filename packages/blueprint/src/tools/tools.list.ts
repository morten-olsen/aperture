import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listOutputSchema } from '../schemas/schemas.js';

const listBlueprints = createTool({
  id: 'blueprint.list',
  description: 'List all behavioural blueprints (summary view with id, title, and use_case).',
  input: z.object({}),
  output: listOutputSchema,
  invoke: async ({ services }) => {
    const { BlueprintService } = await import('../service/service.js');
    const service = services.get(BlueprintService);
    const blueprints = await service.list();
    return { blueprints };
  },
});

export { listBlueprints };
