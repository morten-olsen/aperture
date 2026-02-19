import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { usageTools } from '../tools/tools.js';

const usagePlugin = createPlugin({
  id: 'usage',
  name: 'Usage',
  description: 'Token usage and cost tracking',
  state: z.unknown(),
  prepare: async ({ tools }) => {
    tools.push(...usageTools);
  },
});

export { usagePlugin };
