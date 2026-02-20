import { createTool } from '@morten-olsen/agentic-core';

import { executeInputSchema, executeOutputSchema } from '../schemas/schemas.js';

const execute = createTool({
  id: 'ssh.execute',
  description: 'Execute a command on a remote host via SSH.',
  input: executeInputSchema,
  output: executeOutputSchema,
  requireApproval: async ({ input, userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const check = await service.checkCommand(userId, input.hostId, input.command);
    if (check.allowed) {
      return { required: false, reason: '' };
    }
    if (check.denied) {
      return {
        required: true,
        reason: `Command "${input.command}" on host "${input.hostId}" is blocked by deny rule "${check.pattern}" / "${check.host}".`,
      };
    }
    return {
      required: true,
      reason: `Command "${input.command}" on host "${input.hostId}" does not match any allowed rule.`,
    };
  },
  invoke: async ({ input, userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const check = await service.checkCommand(userId, input.hostId, input.command);
    if (!check.allowed && check.denied) {
      throw new Error(
        `Command "${input.command}" on host "${input.hostId}" is blocked by deny rule "${check.pattern}" / "${check.host}".`,
      );
    }
    return service.execute({ userId, ...input, force: true });
  },
});

export { execute };
