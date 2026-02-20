import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { showPublicKeyOutputSchema } from '../schemas/schemas.js';

const showPublicKey = createTool({
  id: 'ssh.show-public-key',
  description:
    'Show the SSH public key for the current user. Generates a new ed25519 key pair on first call. Add this key to remote servers to allow the agent to connect.',
  input: z.object({}),
  output: showPublicKeyOutputSchema,
  invoke: async ({ userId, services }) => {
    const { SshService } = await import('../service/service.js');
    const service = services.get(SshService);
    const keyPair = await service.getOrCreateKeyPair(userId);
    return { publicKey: keyPair.publicKey };
  },
});

export { showPublicKey };
