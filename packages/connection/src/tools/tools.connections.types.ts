import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsTypes = createTool({
  id: 'configuration.connections.types',
  description: 'List all available connection types and their required fields.',
  input: z.object({}),
  output: z.object({
    types: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        secretFields: z.array(z.string()),
      }),
    ),
  }),
  invoke: async ({ services }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);
    const types = connectionService.listTypes();
    return {
      types: types.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        secretFields: t.fields.secretFields,
      })),
    };
  },
});

export { connectionsTypes };
