import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const promptGetTool = createTool({
  id: 'prompt.get',
  description: 'Get a single prompt by ID, including its full output history',
  input: z.object({
    id: z.string().describe('Prompt ID'),
  }),
  output: z.object({
    prompt: z.unknown().nullable(),
  }),
  invoke: async ({ input, services }) => {
    const { PromptStoreService } = await import('@morten-olsen/agentic-database');
    const promptStore = services.get(PromptStoreService);
    const prompt = await promptStore.getById(input.id);
    return { prompt: prompt ?? null };
  },
});

export { promptGetTool };
