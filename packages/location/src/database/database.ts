import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'location',
  schema: {
    location_entries: z.object({
      user_id: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      captured_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-19-init': {
      up: async (db) => {
        await db.schema
          .createTable('location_entries')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('latitude', 'real', (cb) => cb.notNull())
          .addColumn('longitude', 'real', (cb) => cb.notNull())
          .addColumn('captured_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
