import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { weatherTools } from '../tools/tools.js';

const weatherPlugin = createPlugin({
  id: 'weather',
  state: z.unknown(),
  prepare: async ({ tools }) => {
    tools.push(...weatherTools);
  },
});

export { weatherPlugin };
