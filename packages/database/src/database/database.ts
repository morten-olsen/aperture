import { ZodType } from 'zod';

import type { Database } from './database.types.js';

const createDatabase = <TSchema extends Record<string, ZodType> = Record<string, ZodType>>(
  database: Database<TSchema>,
): Database<TSchema> => database;

export * from './database.types.js';
export * from './database.service.js';
export { createDatabase };
