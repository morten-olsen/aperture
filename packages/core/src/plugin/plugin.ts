import type { ZodType } from 'zod';

import type { Plugin } from './plugin.types.js';

const createPlugin = <TSchema extends ZodType>(plugin: Plugin<TSchema>): Plugin<TSchema> => plugin;

export * from './plugin.service.js';
export * from './plugin.types.js';
export * from './plugin.prepare.js';
export { createPlugin };
