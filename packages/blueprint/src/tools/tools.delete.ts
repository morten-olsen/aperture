import { createTool } from '@morten-olsen/agentic-core';

import { deleteInputSchema, deleteOutputSchema } from '../schemas/schemas.js';

const deleteBlueprint = createTool({
  id: 'blueprint.delete',
  description: 'Delete a behavioural blueprint permanently.',
  input: deleteInputSchema,
  output: deleteOutputSchema,
  invoke: async ({ input, services }) => {
    const { BlueprintService } = await import('../service/service.js');
    const service = services.get(BlueprintService);
    await service.delete(input.id);
    return { deleted: true };
  },
});

export { deleteBlueprint };
