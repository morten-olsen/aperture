import { createTool } from '@morten-olsen/agentic-core';

import { usageQueryInputSchema, usageSummaryOutputSchema } from '../schemas/schemas.js';

const getUsage = createTool({
  id: 'usage.get',
  description:
    'Get token usage and cost summary for prompts. Defaults to the last 24 hours. Returns total prompt count, token breakdown, cost (if available), and per-model breakdown.',
  input: usageQueryInputSchema,
  output: usageSummaryOutputSchema,
  invoke: async ({ input, services }) => {
    const { PromptStoreService } = await import('@morten-olsen/agentic-database');
    const promptStore = services.get(PromptStoreService);
    const after = input.after ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return promptStore.getUsageSummary({
      after,
      before: input.before,
      userId: input.userId,
      resolvedModel: input.resolvedModel,
    });
  },
});

export { getUsage };
