import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import type { NotifyHandler } from '../schemas/schemas.js';
import { triggerNotifyInputSchema } from '../schemas/schemas.js';

const createNotifyTool = (handler: NotifyHandler) =>
  createTool({
    id: 'trigger.notify',
    description:
      'Send a notification to the user. Only available in trigger-invoked sessions. Use this to communicate findings since the user does not see this conversation directly.',
    input: triggerNotifyInputSchema,
    output: z.object({
      sent: z.boolean(),
    }),
    invoke: async ({ input }) => {
      await handler(input);
      return { sent: true };
    },
  });

export { createNotifyTool };
