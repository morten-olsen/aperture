import { z } from 'zod';

const triggerStatusSchema = z.enum(['active', 'paused', 'completed', 'failed']);

type TriggerStatus = z.infer<typeof triggerStatusSchema>;

const triggerReferenceSchema = z.object({
  id: z.string(),
  type: z.enum(['cron', 'once']),
});

type TriggerReference = z.infer<typeof triggerReferenceSchema>;

const triggerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  goal: z.string(),
  model: z.enum(['normal', 'high']),
  scheduleType: z.enum(['once', 'cron']),
  scheduleValue: z.string(),
  status: triggerStatusSchema,
  setupContext: z.string().nullable(),
  invocationCount: z.number(),
  lastInvokedAt: z.string().nullable(),
  nextInvocationAt: z.string().nullable(),
  continuation: z.string().nullable(),
  continuationUpdatedAt: z.string().nullable(),
  maxInvocations: z.number().nullable(),
  endsAt: z.string().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Trigger = z.infer<typeof triggerSchema>;

const triggerCreateInputSchema = z.object({
  userId: z.string(),
  name: z.string().describe('Human-readable name for the trigger'),
  goal: z.string().describe('What the agent should accomplish when invoked'),
  model: z.enum(['normal', 'high']).describe('Model ID to use when invoking this trigger'),
  scheduleType: z
    .enum(['once', 'cron'])
    .describe('Type of schedule: "once" for a one-time trigger, "cron" for recurring'),
  scheduleValue: z
    .string()
    .describe('For once: ISO8601 datetime (e.g. "2026-03-15T09:00:00Z"). For cron: expression (e.g. "0 9 * * 1-5")'),
  setupContext: z.string().optional().describe('Why this trigger exists (injected as context on invocation)'),
  maxInvocations: z.number().optional().describe('For recurring: stop after N invocations'),
  endsAt: z.string().optional().describe('For recurring: stop after this ISO8601 datetime'),
});

type TriggerCreateInput = z.infer<typeof triggerCreateInputSchema>;

const triggerUpdateInputSchema = z.object({
  userId: z.string(),
  triggerId: z.string().describe('ID of the trigger to update'),
  name: z.string().optional().describe('New name'),
  goal: z.string().optional().describe('New goal'),
  model: z.enum(['normal', 'high']).optional().describe('New model ID'),
  scheduleType: z.enum(['once', 'cron']).optional().describe('New schedule type'),
  scheduleValue: z
    .string()
    .optional()
    .describe('New schedule value. For once: ISO8601 datetime. For cron: cron expression'),
  setupContext: z.string().optional().describe('New setup context'),
  maxInvocations: z.number().optional().describe('New max invocations'),
  endsAt: z.string().optional().describe('New end datetime'),
  status: z.enum(['active', 'paused']).optional().describe('New status (active or paused)'),
  continuation: z.string().nullable().optional().describe('Note for next invocation (null to clear)'),
});

type TriggerUpdateInput = z.infer<typeof triggerUpdateInputSchema>;

const triggerDeleteInputSchema = z.object({
  userId: z.string(),
  triggerId: z.string().describe('ID of the trigger to delete'),
});

type TriggerDeleteInput = z.infer<typeof triggerDeleteInputSchema>;

const triggerListInputSchema = z.object({
  userId: z.string(),
  status: triggerStatusSchema.optional().describe('Filter by status'),
  limit: z.number().optional().describe('Maximum number of results (default 50)'),
});

type TriggerListInput = z.infer<typeof triggerListInputSchema>;

const triggerPromptSchema = z.object({
  userId: z.string(),
  triggerId: z.string(),
  promptId: z.string(),
  invokedAt: z.string(),
});

type TriggerPrompt = z.infer<typeof triggerPromptSchema>;

export {
  triggerStatusSchema,
  triggerReferenceSchema,
  triggerSchema,
  triggerCreateInputSchema,
  triggerUpdateInputSchema,
  triggerDeleteInputSchema,
  triggerListInputSchema,
  triggerPromptSchema,
};

export type {
  TriggerStatus,
  TriggerReference,
  Trigger,
  TriggerCreateInput,
  TriggerUpdateInput,
  TriggerDeleteInput,
  TriggerListInput,
  TriggerPrompt,
};
