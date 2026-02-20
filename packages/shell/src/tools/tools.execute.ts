import { createTool } from '@morten-olsen/agentic-core';

import { executeInputSchema, executeOutputSchema } from '../schemas/schemas.js';

const execute = createTool({
  id: 'shell.execute',
  description: 'Execute a shell command and return its output.',
  input: executeInputSchema,
  output: executeOutputSchema,
  requireApproval: async ({ input, userId, services }) => {
    const { ShellService } = await import('../service/service.js');
    const service = services.get(ShellService);
    const check = await service.checkCommand(userId, input.command);
    if (check.allowed) {
      return { required: false, reason: '' };
    }
    if (check.denied) {
      return { required: true, reason: `Command "${input.command}" is blocked by deny rule "${check.pattern}".` };
    }
    return { required: true, reason: `Command "${input.command}" does not match any allowed pattern.` };
  },
  invoke: async ({ input, userId, services }) => {
    const { ShellService } = await import('../service/service.js');
    const service = services.get(ShellService);
    const check = await service.checkCommand(userId, input.command);
    if (!check.allowed && check.denied) {
      throw new Error(`Command "${input.command}" is blocked by deny rule "${check.pattern}".`);
    }
    return service.execute({ userId, ...input, force: true });
  },
});

export { execute };
