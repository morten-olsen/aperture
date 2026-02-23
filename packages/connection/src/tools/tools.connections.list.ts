import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsList = createTool({
  id: 'configuration.connections.list',
  description: 'List connections, optionally filtered by type.',
  input: z.object({
    type: z.string().optional().describe('Filter by connection type ID'),
  }),
  output: z.object({
    connections: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        name: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const connections = await connectionService.list(userId, input.type);
    return {
      connections: connections.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  },
});

export { connectionsList };
