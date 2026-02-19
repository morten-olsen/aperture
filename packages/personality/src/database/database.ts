import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'personality',
  schema: {
    personality_entries: z.object({
      user_id: z.string(),
      content: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-19-init': {
      up: async (db) => {
        await db.schema
          .createTable('personality_entries')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull().primaryKey())
          .addColumn('content', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
