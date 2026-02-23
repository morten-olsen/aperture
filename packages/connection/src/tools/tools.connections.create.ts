import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsCreate = createTool({
  id: 'configuration.connections.create',
  description:
    'Create a new connection of a registered type. Fields are validated against the type schema. Secret fields accept either a secret UUID or a secret name (resolved automatically).',
  input: z.object({
    type: z.string().describe('Connection type ID'),
    name: z.string().describe('Human-readable name for this connection'),
    fields: z.record(z.string(), z.unknown()).describe('Connection fields matching the type schema'),
  }),
  output: z.object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const connection = await connectionService.create(userId, input);
    return { id: connection.id, type: connection.type, name: connection.name };
  },
});

export { connectionsCreate };
