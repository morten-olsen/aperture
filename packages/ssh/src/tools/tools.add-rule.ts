import { createTool } from '@morten-olsen/agentic-core';

import { addRuleInputSchema, addRuleOutputSchema } from '../schemas/schemas.js';

const addRule = createTool({
  id: 'ssh.add-rule',
  description:
    'Add a rule to the SSH command rules. Supports glob-style wildcards for both command patterns and host ID patterns. Use type "allow" to whitelist or "deny" to blacklist.',
  input: addRuleInputSchema,
  output: addRuleOutputSchema,
  requireApproval: { required: true, reason: 'Adding a rule modifies SSH command execution permissions.' },
  invoke: async ({ input, userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const added = await service.addRule(userId, input.pattern, input.host, input.type);
    return { pattern: input.pattern, host: input.host, type: input.type, added };
  },
});

export { addRule };
