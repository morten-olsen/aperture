import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const timePlugin = createPlugin({
  id: 'time',
  name: 'Time',
  description: 'Provides the current time as context',
  state: z.unknown(),
  prepare: async ({ context }) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localTime = new Date().toLocaleString('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    context.items.push({
      type: 'current-time',
      content: `The current time is ${localTime} (timezone: ${timezone})`,
    });
  },
});

export { timePlugin };
