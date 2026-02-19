import { createTool } from '@morten-olsen/agentic-core';

import { createInputSchema, blueprintSchema } from '../schemas/schemas.js';

const createBlueprint = createTool({
  id: 'blueprint.create',
  description: 'Create a new behavioural blueprint to remember how to handle a recurring task.',
  input: createInputSchema,
  output: blueprintSchema,
  invoke: async ({ input, services }) => {
    const { BlueprintService } = await import('../service/service.js');
    const service = services.get(BlueprintService);
    return service.create(input);
  },
});

export { createBlueprint };
