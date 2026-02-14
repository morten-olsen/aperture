import { randomUUID } from 'node:crypto';

import { createTool } from '@morten-olsen/agentic-core';

import { triggerCreateSchema, triggerSchema } from '../schemas/schemas.js';

const create = createTool({
  id: 'trigger.create',
  description: 'Create a new trigger',
  input: triggerCreateSchema,
  output: triggerSchema,
  invoke: async ({ input }) => {
    const id = randomUUID();

    return {
      ...input,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
});

export { create };
