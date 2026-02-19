import { createTool } from '@morten-olsen/agentic-core';

import { updateInputSchema, blueprintSchema } from '../schemas/schemas.js';

const updateBlueprint = createTool({
  id: 'blueprint.update',
  description:
    'Update one or more fields of an existing blueprint. Re-embeds automatically if title or use_case changes.',
  input: updateInputSchema,
  output: blueprintSchema,
  invoke: async ({ input, services }) => {
    const { BlueprintService } = await import('../service/service.js');
    const service = services.get(BlueprintService);
    const { id, ...changes } = input;
    return service.update(id, changes);
  },
});

export { updateBlueprint };
