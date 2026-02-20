import type { ZodType } from 'zod';

import type { Plugin } from './plugin.types.js';

const createPlugin = <TState extends ZodType, TConfig extends ZodType>(
  plugin: Plugin<TState, TConfig>,
): Plugin<TState, TConfig> => plugin;

export * from './plugin.service.js';
export * from './plugin.types.js';
export * from './plugin.prepare.js';
export { createPlugin };
