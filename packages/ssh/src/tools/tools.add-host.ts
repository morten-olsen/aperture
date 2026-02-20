import { createTool } from '@morten-olsen/agentic-core';

import { addHostInputSchema, addHostOutputSchema } from '../schemas/schemas.js';

const addHost = createTool({
  id: 'ssh.add-host',
  description: 'Add an SSH host configuration.',
  input: addHostInputSchema,
  output: addHostOutputSchema,
  requireApproval: { required: true, reason: 'Adding a host registers a new SSH connection target.' },
  invoke: async ({ input, userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const added = await service.addHost(userId, {
      id: input.id,
      hostname: input.hostname,
      port: input.port,
      username: input.username,
    });
    return { id: input.id, added };
  },
});

export { addHost };
