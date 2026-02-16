import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { triggerCreateInputSchema } from '../schemas/schemas.js';

const create = createTool({
  id: 'trigger.create',
  description:
    'Create a new scheduled trigger. Triggers invoke the agent in the background on a schedule (one-time or recurring cron).',
  input: triggerCreateInputSchema.omit({ userId: true }),
  output: z.object({
    triggerId: z.string(),
    name: z.string(),
    status: z.string(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { TriggerScheduler } = await import('../scheduler/scheduler.js');
    const triggerService = services.get(TriggerScheduler);
    const trigger = await triggerService.create({ ...input, userId });
    return { triggerId: trigger.id, name: trigger.name, status: trigger.status };
  },
});

export { create };
