import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const secretsList = createTool({
  id: 'configuration.secrets.list',
  description: 'List all stored secrets for the current user. Returns metadata only — values are never exposed.',
  input: z.object({}),
  output: z.object({
    secrets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  invoke: async ({ services, userId }) => {
    const secrets = await services.secrets.list(userId);
    return {
      secrets: secrets.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    };
  },
});

export { secretsList };
