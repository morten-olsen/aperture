import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const get = createTool({
  id: 'trigger.get',
  description: 'Get full details for a single trigger by ID.',
  input: z.object({
    triggerId: z.string().describe('ID of the trigger to retrieve'),
  }),
  output: z.object({
    id: z.string(),
    name: z.string(),
    goal: z.string(),
    model: z.string(),
    setupContext: z.string().nullable(),
    scheduleType: z.string(),
    scheduleValue: z.string(),
    status: z.string(),
    invocationCount: z.number(),
    maxInvocations: z.number().nullable(),
    endsAt: z.string().nullable(),
    nextInvocationAt: z.string().nullable(),
    lastInvokedAt: z.string().nullable(),
    continuation: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { TriggerScheduler } = await import('../scheduler/scheduler.js');
    const scheduler = services.get(TriggerScheduler);
    const trigger = await scheduler.get(input.triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${input.triggerId} not found`);
    }
    if (trigger.userId !== userId) {
      throw new Error('User not owner of trigger');
    }
    return {
      id: trigger.id,
      name: trigger.name,
      goal: trigger.goal,
      model: trigger.model,
      setupContext: trigger.setupContext,
      scheduleType: trigger.scheduleType,
      scheduleValue: trigger.scheduleValue,
      status: trigger.status,
      invocationCount: trigger.invocationCount,
      maxInvocations: trigger.maxInvocations,
      endsAt: trigger.endsAt,
      nextInvocationAt: trigger.nextInvocationAt,
      lastInvokedAt: trigger.lastInvokedAt,
      continuation: trigger.continuation,
      createdAt: trigger.createdAt,
      updatedAt: trigger.updatedAt,
    };
  },
});

export { get };
