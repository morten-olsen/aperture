import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { triggerNotifyInputSchema } from '../schemas/schemas.js';
import { NotificationService } from '../service/service.js';

const notifyTool = createTool({
  id: 'trigger.notify',
  description:
    'Send a notification to the user. Use this to communicate findings since the user does not see this conversation directly.',
  input: triggerNotifyInputSchema.omit({ userId: true }),
  output: z.object({
    sent: z.boolean(),
  }),
  invoke: async ({ input, services, userId }) => {
    const notificationService = services.get(NotificationService);
    await notificationService.publish({ ...input, userId });
    return { sent: true };
  },
});

export { notifyTool };
