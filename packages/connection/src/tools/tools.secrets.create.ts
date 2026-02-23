import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const secretsCreate = createTool({
  id: 'configuration.secrets.create',
  description: 'Store a new secret (API key, token, password). The value is encrypted at rest and never shown in full.',
  input: z.object({
    name: z.string().describe('Human-readable name for this secret'),
    value: z.string().describe('The secret value to store'),
    description: z.string().optional().describe('Optional description of what this secret is for'),
  }),
  output: z.object({
    id: z.string(),
    name: z.string(),
  }),
  invoke: async ({ input, services, userId }) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await services.secrets.set(
      userId,
      {
        id,
        userId,
        name: input.name,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      },
      input.value,
    );
    return { id, name: input.name };
  },
});

export { secretsCreate };
