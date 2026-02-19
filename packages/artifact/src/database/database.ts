import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'artifact',
  schema: {
    artifact_artifacts: z.object({
      id: z.string(),
      type: z.string(),
      description: z.string().nullable(),
      data: z.string(),
      created_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-19-init': {
      up: async (db) => {
        await db.schema
          .createTable('artifact_artifacts')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('type', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('description', 'text')
          .addColumn('data', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
