import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const timePlugin = createPlugin({
  id: 'time',
  name: 'Time',
  description: 'Provides the current time as context',
  state: z.unknown(),
  prepare: async ({ context }) => {
    context.items.push({
      type: 'current-time',
      content: `The current time is ${new Date().toISOString()}`,
    });
  },
});

export { timePlugin };
