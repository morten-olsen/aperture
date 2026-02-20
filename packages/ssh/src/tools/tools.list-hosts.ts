import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listHostsOutputSchema } from '../schemas/schemas.js';

const listHosts = createTool({
  id: 'ssh.list-hosts',
  description: 'List all configured SSH hosts.',
  input: z.object({}),
  output: listHostsOutputSchema,
  invoke: async ({ userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const hosts = await service.listHosts(userId);
    return { hosts };
  },
});

export { listHosts };
