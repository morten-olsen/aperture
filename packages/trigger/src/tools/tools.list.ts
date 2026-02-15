import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { triggerListInputSchema } from '../schemas/schemas.js';

const list = createTool({
  id: 'trigger.list',
  description: 'List triggers, optionally filtered by status.',
  input: triggerListInputSchema,
  output: z.object({
    triggers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        scheduleType: z.string(),
        scheduleValue: z.string(),
        status: z.string(),
        invocationCount: z.number(),
        nextInvocationAt: z.string().nullable(),
        lastInvokedAt: z.string().nullable(),
      }),
    ),
  }),
  invoke: async ({ input, services }) => {
    const { TriggerScheduler } = await import('../scheduler/scheduler.js');
    const triggerService = services.get(TriggerScheduler);
    const triggers = await triggerService.list(input);
    return {
      triggers: triggers.map((t) => ({
        id: t.id,
        name: t.name,
        scheduleType: t.scheduleType,
        scheduleValue: t.scheduleValue,
        status: t.status,
        invocationCount: t.invocationCount,
        nextInvocationAt: t.nextInvocationAt,
        lastInvokedAt: t.lastInvokedAt,
      })),
    };
  },
});

export { list };
