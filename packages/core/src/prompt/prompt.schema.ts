import { z } from 'zod';

const promptOutputBase = z.object({
  start: z.iso.date(),
  end: z.iso.date().optional(),
});

const promptOutputTextSchema = promptOutputBase.extend({
  type: z.literal('text'),
  content: z.string().optional(),
});

type PromptOutputText = z.input<typeof promptOutputTextSchema>;

const promptOutputToolResultSuccessSchema = z.object({
  type: z.literal('success'),
  output: z.unknown(),
});

type PromptOutputToolResultSuccess = z.input<typeof promptOutputToolResultSuccessSchema>;

const promptOutputToolResultErrorSchema = z.object({
  type: z.literal('error'),
  error: z.unknown(),
});

type PromptOutputToolResultError = z.input<typeof promptOutputToolResultErrorSchema>;

const promptOutputToolResultPendingSchema = z.object({
  type: z.literal('pending'),
  reason: z.string(),
});

type PromptOutputToolResultPending = z.input<typeof promptOutputToolResultPendingSchema>;

const promptOutputToolResultSchema = z.discriminatedUnion('type', [
  promptOutputToolResultSuccessSchema,
  promptOutputToolResultErrorSchema,
  promptOutputToolResultPendingSchema,
]);

type PromptOutputToolResult = z.input<typeof promptOutputToolResultSchema>;

const promptOutputToolSchema = promptOutputBase.extend({
  type: z.literal('tool'),
  id: z.string(),
  function: z.string(),
  input: z.unknown(),
  result: promptOutputToolResultSchema,
});

type PromptOutputTool = z.input<typeof promptOutputToolSchema>;

const promptOutputSchema = z.discriminatedUnion('type', [promptOutputTextSchema, promptOutputToolSchema]);

type PromptOutput = z.input<typeof promptOutputSchema>;

const promptSchema = z.object({
  id: z.string(),
  userId: z.string(),
  model: z.enum(['normal', 'high']),
  visible: z.boolean().default(true),
  state: z.enum(['running', 'completed', 'waiting_for_approval']),
  input: z.string().optional(),
  output: z.array(promptOutputSchema),
});

type Prompt = z.input<typeof promptSchema>;

export type {
  PromptOutputText,
  PromptOutputToolResultSuccess,
  PromptOutputToolResultError,
  PromptOutputToolResultPending,
  PromptOutputToolResult,
  PromptOutputTool,
  PromptOutput,
  Prompt,
};

export {
  promptOutputTextSchema,
  promptOutputToolResultSuccessSchema,
  promptOutputToolResultErrorSchema,
  promptOutputToolResultPendingSchema,
  promptOutputToolResultSchema,
  promptOutputToolSchema,
  promptOutputSchema,
  promptSchema,
};
