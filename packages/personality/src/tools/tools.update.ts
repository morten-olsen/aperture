import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const update = createTool({
  id: 'personality.update',
  description:
    'Update your personality — how you behave, your tone, style, and preferences. The stored description is injected into every prompt so you adopt it automatically.',
  input: z.object({
    content: z.string().max(2000).describe('The new personality description (max 2000 characters).'),
  }),
  output: z.object({
    success: z.boolean(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { PersonalityRepo } = await import('../repo/repo.js');
    const repo = new PersonalityRepo(services);
    await repo.set(userId, input.content);
    return { success: true };
  },
});

export { update };
