import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'web_fetch',
  schema: {
    web_fetch_allowed_domains: z.object({
      domain: z.string(),
      created_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-18-init': {
      up: async (db) => {
        await db.schema
          .createTable('web_fetch_allowed_domains')
          .addColumn('domain', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
