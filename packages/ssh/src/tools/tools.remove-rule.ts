import { createTool } from '@morten-olsen/agentic-core';

import { removeRuleInputSchema, removeRuleOutputSchema } from '../schemas/schemas.js';

const removeRule = createTool({
  id: 'ssh.remove-rule',
  description: 'Remove a rule from the SSH command rules.',
  input: removeRuleInputSchema,
  output: removeRuleOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const removed = await service.removeRule(userId, input.pattern, input.host);
    return { pattern: input.pattern, host: input.host, removed };
  },
});

export { removeRule };
