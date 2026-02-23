import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsGet = createTool({
  id: 'configuration.connections.get',
  description: 'Get details of a specific connection by ID.',
  input: z.object({
    id: z.string().describe('The connection ID'),
  }),
  output: z.object({
    connection: z
      .object({
        id: z.string(),
        type: z.string(),
        name: z.string(),
        fields: z.record(z.string(), z.unknown()),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
      .nullable(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const connection = await connectionService.get(userId, input.id);
    if (!connection) return { connection: null };
    return {
      connection: {
        id: connection.id,
        type: connection.type,
        name: connection.name,
        fields: connection.fields,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    };
  },
});

export { connectionsGet };
