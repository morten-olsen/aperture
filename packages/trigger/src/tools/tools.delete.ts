import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { triggerDeleteInputSchema } from '../schemas/schemas.js';

const createDeleteTool = (currentTriggerId?: string) => {
  const inputSchema = currentTriggerId
    ? triggerDeleteInputSchema.extend({
        triggerId: z.string().optional().describe('ID of the trigger to delete (defaults to current trigger)'),
      })
    : triggerDeleteInputSchema;

  return createTool({
    id: 'trigger.delete',
    description: 'Delete a trigger permanently. Removes the trigger and all associated records.',
    input: inputSchema,
    output: z.object({
      deleted: z.boolean(),
    }),
    invoke: async ({ input, services }) => {
      const { TriggerScheduler } = await import('../scheduler/scheduler.js');
      const triggerService = services.get(TriggerScheduler);
      const triggerId = input.triggerId ?? currentTriggerId;
      if (!triggerId) {
        throw new Error('triggerId is required');
      }
      await triggerService.delete(triggerId);
      return { deleted: true };
    },
  });
};

export { createDeleteTool };
