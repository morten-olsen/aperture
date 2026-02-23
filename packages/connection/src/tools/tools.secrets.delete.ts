import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const secretsDelete = createTool({
  id: 'configuration.secrets.delete',
  description: 'Delete a stored secret. Warns if any connections reference it.',
  input: z.object({
    id: z.string().describe('The secret ID to delete'),
  }),
  output: z.object({
    deleted: z.boolean(),
    affectedConnections: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
      }),
    ),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const affected = await connectionService.findBySecretId(userId, input.id);

    await services.secrets.remove(userId, input.id);

    return {
      deleted: true,
      affectedConnections: affected.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      })),
    };
  },
});

export { secretsDelete };
