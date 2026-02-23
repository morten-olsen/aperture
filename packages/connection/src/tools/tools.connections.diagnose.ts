import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const connectionsDiagnose = createTool({
  id: 'configuration.connections.diagnose',
  description:
    'Diagnose a connection by checking if all secret fields resolve to non-empty values. Does not expose actual secret values.',
  input: z.object({
    id: z.string().describe('Connection ID to diagnose'),
  }),
  output: z.object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    fields: z.array(
      z.object({
        field: z.string(),
        isSecret: z.boolean(),
        hasValue: z.boolean(),
        valueLength: z.number(),
        storedRaw: z.string().optional(),
      }),
    ),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('../service/service.js');
    const connectionService = services.get(ConnectionService);

    const connection = await connectionService.get(userId, input.id);
    if (!connection) {
      throw new Error(`Connection not found: ${input.id}`);
    }

    const typeDef = connectionService.getType(connection.type);
    const secretFieldNames = new Set(typeDef?.fields.secretFields ?? []);

    const resolved = await connectionService.resolve(userId, input.id);
    if (!resolved) {
      throw new Error(`Could not resolve connection: ${input.id}`);
    }

    const fields = Object.entries(resolved).map(([field, value]) => {
      const isSecret = secretFieldNames.has(field);
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      return {
        field,
        isSecret,
        hasValue: strValue.length > 0,
        valueLength: strValue.length,
        // Show the raw stored value for non-secret fields only
        storedRaw: isSecret ? undefined : strValue,
      };
    });

    return { id: connection.id, type: connection.type, name: connection.name, fields };
  },
});

export { connectionsDiagnose };
