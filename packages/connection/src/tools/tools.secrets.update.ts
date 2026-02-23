import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const secretsUpdate = createTool({
  id: 'configuration.secrets.update',
  description: 'Update a stored secret — change its name, description, or value.',
  input: z.object({
    id: z.string().describe('The secret ID to update'),
    name: z.string().optional().describe('New name'),
    description: z.string().optional().describe('New description'),
    value: z.string().optional().describe('New secret value'),
  }),
  output: z.object({
    id: z.string(),
    updated: z.boolean(),
  }),
  invoke: async ({ input, services, userId }) => {
    await services.secrets.update(userId, input.id, {
      name: input.name,
      description: input.description,
      value: input.value,
    });
    return { id: input.id, updated: true };
  },
});

export { secretsUpdate };
