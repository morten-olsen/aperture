import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsDelete = createTool({
  id: 'configuration.connections.delete',
  description: 'Delete a connection by ID.',
  input: z.object({
    id: z.string().describe('The connection ID to delete'),
  }),
  output: z.object({
    deleted: z.boolean(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const deleted = await connectionService.delete(userId, input.id);
    return { deleted };
  },
});

export { connectionsDelete };
