import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'blueprint',
  schema: {
    blueprint_blueprints: z.object({
      id: z.string(),
      title: z.string(),
      use_case: z.string(),
      process: z.string(),
      notes: z.string().nullable(),
      embedding: z.instanceof(Buffer),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-19-init': {
      up: async (db) => {
        await db.schema
          .createTable('blueprint_blueprints')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('title', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('use_case', 'text', (cb) => cb.notNull())
          .addColumn('process', 'text', (cb) => cb.notNull())
          .addColumn('notes', 'text')
          .addColumn('embedding', 'blob')
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('updated_at', 'varchar(255)', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
