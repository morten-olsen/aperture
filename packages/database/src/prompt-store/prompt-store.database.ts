import { z } from 'zod';

import { createDatabase } from '../database/database.js';

const promptStoreDatabase = createDatabase({
  id: 'db',
  schema: {
    db_prompts: z.object({
      id: z.string(),
      model: z.enum(['normal', 'high']),
      userId: z.string(),
      visible: z.number(),
      state: z.string(),
      input: z.string().nullable(),
      output: z.string(),
      created_at: z.string(),
      completed_at: z.string().nullable(),
      input_tokens: z.number().nullable(),
      output_tokens: z.number().nullable(),
      total_tokens: z.number().nullable(),
      reasoning_tokens: z.number().nullable(),
      cost: z.number().nullable(),
      resolved_model: z.string().nullable(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('db_prompts')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('model', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('userId', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('visible', 'integer', (cb) => cb.notNull().defaultTo(1))
          .addColumn('state', 'varchar(50)', (cb) => cb.notNull())
          .addColumn('input', 'text')
          .addColumn('output', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('completed_at', 'text')
          .execute();
      },
    },
    '2026-02-20-usage': {
      up: async (db) => {
        await db.schema.alterTable('db_prompts').addColumn('input_tokens', 'integer').execute();
        await db.schema.alterTable('db_prompts').addColumn('output_tokens', 'integer').execute();
        await db.schema.alterTable('db_prompts').addColumn('total_tokens', 'integer').execute();
        await db.schema.alterTable('db_prompts').addColumn('reasoning_tokens', 'integer').execute();
        await db.schema.alterTable('db_prompts').addColumn('cost', 'real').execute();
        await db.schema.alterTable('db_prompts').addColumn('resolved_model', 'varchar(255)').execute();
      },
    },
  },
});

export { promptStoreDatabase };
