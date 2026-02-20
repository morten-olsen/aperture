import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listRulesOutputSchema } from '../schemas/schemas.js';

const listRules = createTool({
  id: 'shell.list-rules',
  description: 'List all shell command rules (both allow and deny patterns).',
  input: z.object({}),
  output: listRulesOutputSchema,
  invoke: async ({ userId, services }) => {
    const { ShellService } = await import('../service/service.js');
    const service = services.get(ShellService);
    const rules = await service.listRules(userId);
    return { rules };
  },
});

export { listRules };
