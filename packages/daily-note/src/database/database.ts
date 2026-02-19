import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'daily-note',
  schema: {
    daily_note_entries: z.object({
      user_id: z.string(),
      date: z.string(),
      content: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-19-init': {
      up: async (db) => {
        await db.schema
          .createTable('daily_note_entries')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('date', 'varchar(10)', (cb) => cb.notNull())
          .addColumn('content', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createIndex('daily_note_entries_user_date')
          .on('daily_note_entries')
          .columns(['user_id', 'date'])
          .unique()
          .execute();
      },
    },
  },
});

export { database };
