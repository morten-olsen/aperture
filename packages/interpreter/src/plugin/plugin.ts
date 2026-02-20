import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { InterpreterService } from '../service/service.js';
import { interpreterTools } from '../tools/tools.js';

const interpreterPlugin = createPlugin({
  id: 'interpreter',
  name: 'Interpreter',
  description: 'Execute JavaScript code in a sandboxed environment',
  config: z.unknown(),
  state: z.unknown(),
  prepare: async ({ tools, services }) => {
    const interpreterService = services.get(InterpreterService);
    tools.push(interpreterTools.createRunCode(interpreterService));
  },
});

export { interpreterPlugin };
