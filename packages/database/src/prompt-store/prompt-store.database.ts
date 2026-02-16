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
  },
});

export { promptStoreDatabase };
