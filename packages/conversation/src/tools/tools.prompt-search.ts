import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const promptSearchTool = createTool({
  id: 'prompt.search',
  description: 'Search and list prompts with optional filters for date range and pagination',
  input: z.object({
    before: z.string().optional().describe('ISO date — return prompts created before this time'),
    after: z.string().optional().describe('ISO date — return prompts created after this time'),
    limit: z.number().optional().describe('Max results (default 50)'),
    offset: z.number().optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    prompts: z.array(z.unknown()),
  }),
  invoke: async ({ input, services }) => {
    const { PromptStoreService } = await import('@morten-olsen/agentic-database');
    const promptStore = services.get(PromptStoreService);
    const prompts = await promptStore.search(input);
    return { prompts };
  },
});

export { promptSearchTool };
