import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsUpdate = createTool({
  id: 'configuration.connections.update',
  description: 'Update a connection — change its name or fields.',
  input: z.object({
    id: z.string().describe('The connection ID to update'),
    name: z.string().optional().describe('New name'),
    fields: z.record(z.string(), z.unknown()).optional().describe('New fields (replaces all fields)'),
  }),
  output: z.object({
    id: z.string(),
    updated: z.boolean(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const result = await connectionService.update(userId, input.id, {
      name: input.name,
      fields: input.fields,
    });
    return { id: input.id, updated: result !== undefined };
  },
});

export { connectionsUpdate };
