import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { triggerUpdateInputSchema } from '../schemas/schemas.js';

const createUpdateTool = (currentTriggerId?: string) => {
  const inputSchema = currentTriggerId
    ? triggerUpdateInputSchema.extend({
      triggerId: z.string().optional().describe('ID of the trigger to update (defaults to current trigger)'),
    })
    : triggerUpdateInputSchema;

  return createTool({
    id: 'trigger.update',
    description:
      'Update an existing trigger. Can change name, goal, schedule, status, or set a continuation note for the next invocation.',
    input: inputSchema.omit({ userId: true }),
    output: z.object({
      triggerId: z.string(),
      name: z.string(),
      status: z.string(),
    }),
    invoke: async ({ input, services }) => {
      const { TriggerScheduler } = await import('../scheduler/scheduler.js');
      const triggerService = services.get(TriggerScheduler);
      const triggerId = input.triggerId ?? currentTriggerId;
      if (!triggerId) {
        throw new Error('triggerId is required');
      }
      const trigger = await triggerService.update(triggerId, input);
      if (!trigger) {
        throw new Error(`Trigger ${triggerId} not found`);
      }
      return { triggerId: trigger.id, name: trigger.name, status: trigger.status };
    },
  });
};

export { createUpdateTool };
