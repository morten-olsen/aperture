import { createTool } from '@morten-olsen/agentic-core';

import { getInputSchema, blueprintSchema } from '../schemas/schemas.js';

const getBlueprint = createTool({
  id: 'blueprint.get',
  description: 'Fetch the full details of a behavioural blueprint.',
  input: getInputSchema,
  output: blueprintSchema,
  invoke: async ({ input, services }) => {
    const { BlueprintService } = await import('../service/service.js');
    const service = services.get(BlueprintService);
    const blueprint = await service.get(input.id);
    if (!blueprint) {
      throw new Error(`Blueprint "${input.id}" not found`);
    }
    return blueprint;
  },
});

export { getBlueprint };
