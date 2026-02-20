import { createTool } from '@morten-olsen/agentic-core';

import { removeRuleInputSchema, removeRuleOutputSchema } from '../schemas/schemas.js';

const removeRule = createTool({
  id: 'shell.remove-rule',
  description: 'Remove a pattern from the shell command allowlist.',
  input: removeRuleInputSchema,
  output: removeRuleOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const { ShellService } = await import('../service/service.js');
    const service = services.get(ShellService);
    const removed = await service.removeRule(userId, input.pattern);
    return { pattern: input.pattern, removed };
  },
});

export { removeRule };
