import { createTool } from '@morten-olsen/agentic-core';

import { addRuleInputSchema, addRuleOutputSchema } from '../schemas/schemas.js';

const addRule = createTool({
  id: 'shell.add-rule',
  description:
    'Add a pattern to the shell command rules. Supports glob-style wildcards (e.g. "git *", "npm run *"). Use type "allow" to whitelist or "deny" to blacklist.',
  input: addRuleInputSchema,
  output: addRuleOutputSchema,
  requireApproval: { required: true, reason: 'Adding a rule modifies command execution permissions.' },
  invoke: async ({ input, userId, services }) => {
    const { ShellService } = await import('../service/service.js');
    const service = services.get(ShellService);
    const added = await service.addRule(userId, input.pattern, input.type);
    return { pattern: input.pattern, type: input.type, added };
  },
});

export { addRule };
