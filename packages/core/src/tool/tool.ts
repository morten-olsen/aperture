import type { ZodType } from 'zod';

import type { Tool } from './tool.types.js';

const createTool = <TInput extends ZodType = ZodType, TOutput extends ZodType = ZodType>(
  tool: Tool<TInput, TOutput>,
): Tool<TInput, TOutput> => tool;

export * from './tool.types.js';
export * from './tool.registry.js';
export { createTool };
