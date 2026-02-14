import type { Migration } from 'kysely';
import type { ZodType } from 'zod';

type Database<TSchema extends Record<string, ZodType> = Record<string, ZodType>> = {
  id: string;
  schema: TSchema;
  migrations: Record<string, Migration>;
};

export type { Database };
