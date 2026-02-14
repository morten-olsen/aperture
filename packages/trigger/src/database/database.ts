import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'triggers',
  schema: {
    triggers_triggers: z.object({
      id: z.string(),
      title: z.string(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        db.schema
          .createTable('triggers_triggers')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('title', 'varchar(255)')
          .addColumn('goal', 'text')
          .addColumn('once', 'datetime')
          .addColumn('cron', 'text')
          .addColumn('behaviour_id', 'varchar')
          .execute();
      },
    },
  },
});

export { database };
