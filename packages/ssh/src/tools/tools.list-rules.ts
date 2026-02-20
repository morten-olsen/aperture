import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listRulesOutputSchema } from '../schemas/schemas.js';

const listRules = createTool({
  id: 'ssh.list-rules',
  description: 'List all SSH command rules (both allow and deny).',
  input: z.object({}),
  output: listRulesOutputSchema,
  invoke: async ({ userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const rules = await service.listRules(userId);
    return { rules };
  },
});

export { listRules };
