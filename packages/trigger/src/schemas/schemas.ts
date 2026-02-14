import { z } from 'zod';

const triggerReferenceSchema = z.object({
  id: z.string(),
  type: z.enum(['cron', 'once']),
});

const triggerSchema = z.object({
  id: z.string(),
  title: z.string(),
  onceIsoDateTime: z.iso
    .datetime()
    .optional()
    .describe('The time the trigger should fire - either this or cronPattern'),
  cronPattern: z.string().optional().describe('The cron pattern for when this should fire - either this or onceTime'),
  goal: z.string(),
  behaviourId: z.string().optional(),
  continuation: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastTriggeredAt: z.iso.datetime().optional(),
});

const triggerCreateSchema = triggerSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTriggeredAt: true,
});

export { triggerReferenceSchema, triggerSchema, triggerCreateSchema };
