import { z } from 'zod';

import { createEvent } from '../event/event.types.js';

import { approvalRequestedEventSchema, promptOutputSchema, promptUsageSchema } from './prompt.schema.js';

const promptCreatedEvent = createEvent({
  id: 'prompt.created',
  schema: z.object({
    promptId: z.string(),
    userId: z.string(),
  }),
});

const promptOutputEvent = createEvent({
  id: 'prompt.output',
  schema: z.object({
    promptId: z.string(),
    output: promptOutputSchema,
  }),
});

const promptApprovalRequestedEvent = createEvent({
  id: 'prompt.approval-requested',
  schema: z.object({
    promptId: z.string(),
    request: approvalRequestedEventSchema,
  }),
});

const promptCompletedEvent = createEvent({
  id: 'prompt.completed',
  schema: z.object({
    promptId: z.string(),
    output: z.array(promptOutputSchema),
    usage: promptUsageSchema.optional(),
  }),
});

const promptStreamEvent = createEvent({
  id: 'prompt.stream',
  schema: z.object({
    promptId: z.string(),
    delta: z.string(),
  }),
});

const promptErrorEvent = createEvent({
  id: 'prompt.error',
  schema: z.object({
    promptId: z.string(),
    error: z.string(),
  }),
});

const allPromptEvents = [
  promptCreatedEvent,
  promptOutputEvent,
  promptStreamEvent,
  promptApprovalRequestedEvent,
  promptCompletedEvent,
  promptErrorEvent,
];

export {
  promptCreatedEvent,
  promptOutputEvent,
  promptStreamEvent,
  promptApprovalRequestedEvent,
  promptCompletedEvent,
  promptErrorEvent,
  allPromptEvents,
};
