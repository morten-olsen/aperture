import { z } from 'zod';

const usageQueryInputSchema = z.object({
  after: z
    .string()
    .optional()
    .describe('ISO 8601 date string. Only include prompts after this time. Defaults to 24 hours ago.'),
  before: z.string().optional().describe('ISO 8601 date string. Only include prompts before this time.'),
  userId: z.string().optional().describe('Filter by user ID'),
  resolvedModel: z.string().optional().describe('Filter by resolved model name'),
});

type UsageQueryInput = z.infer<typeof usageQueryInputSchema>;

const usageModelBreakdownSchema = z.object({
  resolvedModel: z.string(),
  promptCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  reasoningTokens: z.number(),
  cost: z.number().nullable(),
});

const usageSummaryOutputSchema = z.object({
  promptCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  reasoningTokens: z.number(),
  cost: z.number().nullable(),
  byModel: z.array(usageModelBreakdownSchema),
});

type UsageSummaryOutput = z.infer<typeof usageSummaryOutputSchema>;

export { usageQueryInputSchema, usageModelBreakdownSchema, usageSummaryOutputSchema };
export type { UsageQueryInput, UsageSummaryOutput };
