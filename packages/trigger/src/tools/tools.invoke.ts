import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const invoke = createTool({
  id: 'trigger.invoke',
  description:
    'Invoke a trigger immediately. Returns the trigger context so you can act on its goal directly in the current conversation.',
  input: z.object({
    triggerId: z.string().describe('ID of the trigger to invoke'),
  }),
  output: z.object({
    id: z.string(),
    name: z.string(),
    goal: z.string(),
    model: z.string(),
    setupContext: z.string().nullable(),
    continuation: z.string().nullable(),
    scheduleType: z.string(),
    scheduleValue: z.string(),
    status: z.string(),
    invocationCount: z.number(),
    lastInvokedAt: z.string().nullable(),
  }),
  invoke: async ({ input, services }) => {
    const { TriggerScheduler } = await import('../scheduler/scheduler.js');
    const scheduler = services.get(TriggerScheduler);
    const trigger = await scheduler.get(input.triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${input.triggerId} not found`);
    }
    return {
      id: trigger.id,
      name: trigger.name,
      goal: trigger.goal,
      model: trigger.model,
      setupContext: trigger.setupContext,
      continuation: trigger.continuation,
      scheduleType: trigger.scheduleType,
      scheduleValue: trigger.scheduleValue,
      status: trigger.status,
      invocationCount: trigger.invocationCount,
      lastInvokedAt: trigger.lastInvokedAt,
    };
  },
});

export { invoke };
