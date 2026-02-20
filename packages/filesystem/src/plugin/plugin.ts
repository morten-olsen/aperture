import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { filesystemTools } from '../tools/tools.js';

const filesystemPlugin = createPlugin({
  id: 'filesystem',
  config: z.unknown(),
  state: z.unknown(),
  prepare: async ({ tools }) => {
    tools.push(...filesystemTools);
  },
});

export { filesystemPlugin };
