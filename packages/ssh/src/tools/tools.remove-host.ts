import { createTool } from '@morten-olsen/agentic-core';

import { removeHostInputSchema, removeHostOutputSchema } from '../schemas/schemas.js';

const removeHost = createTool({
  id: 'ssh.remove-host',
  description: 'Remove an SSH host configuration.',
  input: removeHostInputSchema,
  output: removeHostOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const removed = await service.removeHost(userId, input.id);
    return { id: input.id, removed };
  },
});

export { removeHost };
