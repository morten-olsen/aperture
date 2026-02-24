import { createPlugin, ExecutionModeService } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { CodeExecutor } from '../mode/mode.executor.js';
import { InterpreterService } from '../service/service.js';
import { interpreterTools } from '../tools/tools.js';

const interpreterPlugin = createPlugin({
  id: 'interpreter',
  name: 'Interpreter',
  description: 'Execute JavaScript code in a sandboxed environment',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const modeService = services.get(ExecutionModeService);
    modeService.register({
      id: 'code',
      name: 'Code (JavaScript sandbox)',
      createExecutor: (options) => new CodeExecutor(options),
    });
  },
  prepare: async ({ tools, services }) => {
    const interpreterService = services.get(InterpreterService);
    tools.push(interpreterTools.createRunCode(interpreterService));
  },
});

export { interpreterPlugin };
