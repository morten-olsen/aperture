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
    input: inputSchema.omit({ userId: true }),
    output: z.object({
      deleted: z.boolean(),
    }),
    invoke: async ({ input, services, userId }) => {
      const { TriggerScheduler } = await import('../scheduler/scheduler.js');
      const triggerService = services.get(TriggerScheduler);
      const triggerId = input.triggerId ?? currentTriggerId;
      if (!triggerId) {
        throw new Error('triggerId is required');
      }

      const scheduler = services.get(TriggerScheduler);
      const trigger = await scheduler.get(triggerId);
      if (!trigger) {
        throw new Error(`Trigger ${input.triggerId} not found`);
      }
      if (trigger.userId !== userId) {
        throw new Error('User not owner of trigger');
      }
      await triggerService.delete(triggerId);
      return { deleted: true };
    },
  });
};

export { createDeleteTool };
