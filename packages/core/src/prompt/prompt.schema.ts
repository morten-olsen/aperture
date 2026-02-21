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

const promptOutputFileSchema = promptOutputBase.extend({
  type: z.literal('file'),
  path: z.string(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

type PromptOutputFile = z.input<typeof promptOutputFileSchema>;

const promptOutputSchema = z.discriminatedUnion('type', [
  promptOutputTextSchema,
  promptOutputToolSchema,
  promptOutputFileSchema,
]);

type PromptOutput = z.input<typeof promptOutputSchema>;

const promptUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  reasoningTokens: z.number().optional(),
  cost: z.number().optional(),
  resolvedModel: z.string().optional(),
});

type PromptUsage = z.input<typeof promptUsageSchema>;

const promptSchema = z.object({
  id: z.string(),
  userId: z.string(),
  model: z.enum(['normal', 'high']),
  visible: z.boolean().default(true),
  state: z.enum(['running', 'completed', 'waiting_for_approval']),
  input: z.string().optional(),
  output: z.array(promptOutputSchema),
  usage: promptUsageSchema.optional(),
});

type Prompt = z.input<typeof promptSchema>;

const approvalRequestedEventSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  reason: z.string(),
});
type ApprovalRequestedEvent = z.input<typeof approvalRequestedEventSchema>;

export type {
  PromptOutputText,
  PromptOutputFile,
  PromptOutputToolResultSuccess,
  PromptOutputToolResultError,
  PromptOutputToolResultPending,
  PromptOutputToolResult,
  PromptOutputTool,
  PromptOutput,
  Prompt,
  PromptUsage,
  ApprovalRequestedEvent,
};

export {
  promptOutputTextSchema,
  promptOutputFileSchema,
  promptOutputToolResultSuccessSchema,
  promptOutputToolResultErrorSchema,
  promptOutputToolResultPendingSchema,
  promptOutputToolResultSchema,
  promptOutputToolSchema,
  promptOutputSchema,
  promptSchema,
  promptUsageSchema,
  approvalRequestedEventSchema,
};
