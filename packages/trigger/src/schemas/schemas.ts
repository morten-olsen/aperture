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
  name: z.string(),
  goal: z.string(),
  model: z.string(),
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
  name: z.string().describe('Human-readable name for the trigger'),
  goal: z.string().describe('What the agent should accomplish when invoked'),
  model: z.string().describe('Model ID to use when invoking this trigger'),
  scheduleType: z.enum(['once', 'cron']).describe('Type of schedule: "once" for a one-time trigger, "cron" for recurring'),
  scheduleValue: z
    .string()
    .describe('For once: ISO8601 datetime (e.g. "2026-03-15T09:00:00Z"). For cron: expression (e.g. "0 9 * * 1-5")'),
  setupContext: z.string().optional().describe('Why this trigger exists (injected as context on invocation)'),
  maxInvocations: z.number().optional().describe('For recurring: stop after N invocations'),
  endsAt: z.string().optional().describe('For recurring: stop after this ISO8601 datetime'),
});

type TriggerCreateInput = z.infer<typeof triggerCreateInputSchema>;

const triggerUpdateInputSchema = z.object({
  triggerId: z.string().describe('ID of the trigger to update'),
  name: z.string().optional().describe('New name'),
  goal: z.string().optional().describe('New goal'),
  model: z.string().optional().describe('New model ID'),
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
  triggerId: z.string().describe('ID of the trigger to delete'),
});

type TriggerDeleteInput = z.infer<typeof triggerDeleteInputSchema>;

const triggerListInputSchema = z.object({
  status: triggerStatusSchema.optional().describe('Filter by status'),
  limit: z.number().optional().describe('Maximum number of results (default 50)'),
});

type TriggerListInput = z.infer<typeof triggerListInputSchema>;

const triggerNotifyInputSchema = z.object({
  title: z.string().describe('Short notification title (max 100 chars)'),
  body: z.string().describe('Notification content (max 1000 chars)'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Notification urgency level'),
});

type TriggerNotifyInput = z.infer<typeof triggerNotifyInputSchema>;

const triggerPromptSchema = z.object({
  triggerId: z.string(),
  promptId: z.string(),
  invokedAt: z.string(),
});

type TriggerPrompt = z.infer<typeof triggerPromptSchema>;

type NotifyHandler = (input: TriggerNotifyInput) => Promise<void>;

export {
  triggerStatusSchema,
  triggerReferenceSchema,
  triggerSchema,
  triggerCreateInputSchema,
  triggerUpdateInputSchema,
  triggerDeleteInputSchema,
  triggerListInputSchema,
  triggerNotifyInputSchema,
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
  TriggerNotifyInput,
  TriggerPrompt,
  NotifyHandler,
};
