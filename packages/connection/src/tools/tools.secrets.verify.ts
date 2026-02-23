import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const secretsVerify = createTool({
  id: 'configuration.secrets.verify',
  description:
    'Check whether a secret has a non-empty value stored. Returns metadata about the value without exposing it. Useful for diagnosing connection issues.',
  input: z.object({
    id: z.string().describe('Secret ID to verify'),
  }),
  output: z.object({
    id: z.string(),
    exists: z.boolean(),
    hasValue: z.boolean(),
    valueLength: z.number(),
  }),
  invoke: async ({ input, services, userId }) => {
    const value = await services.secrets.get(userId, input.id);
    if (value === undefined) {
      return { id: input.id, exists: false, hasValue: false, valueLength: 0 };
    }
    return { id: input.id, exists: true, hasValue: value.length > 0, valueLength: value.length };
  },
});

export { secretsVerify };
