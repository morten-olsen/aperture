import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { runCodeInput } from '../schemas/schemas.js';
import { InterpreterService } from '../service/service.js';

const baseDescription = [
  'Run JavaScript in a sandboxed QuickJS environment. The last expression is the return value.',
  'Globals: `input` (the provided input object).',
  'No `fetch`, `require`, `process`, `fs`, or browser/Node APIs unless explicitly listed as available.',
  'Use `import`/`export` only for registered modules.',
].join(' ');

const createRunCodeTool = (interpreterService: InterpreterService) => {
  const methods = interpreterService.methodDocs;
  const modules = interpreterService.moduleNames;

  const parts = [baseDescription];
  if (methods.length > 0) {
    parts.push(`Available functions: ${methods.map((m) => `\`${m.name}\`: ${m.description}`).join('; ')}.`);
  }
  if (modules.length > 0) {
    parts.push(`Available modules: ${modules.map((m) => `\`${m}\``).join(', ')}.`);
  }

  return createTool({
    id: 'interpreter.run-code',
    description: parts.join(' '),
    input: runCodeInput,
    output: z.unknown(),
    invoke: async ({ input, services }) => {
      const service = services.get(InterpreterService);
      return service.execute(input);
    },
  });
};

export { createRunCodeTool };
