import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'shell',
  schema: {
    shell_rules: z.object({
      user_id: z.string(),
      pattern: z.string(),
      type: z.string(),
      created_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-20-init': {
      up: async (db) => {
        await db.schema
          .createTable('shell_rules')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('pattern', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('type', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .addPrimaryKeyConstraint('shell_rules_pk', ['user_id', 'pattern'])
          .execute();
      },
    },
  },
});

export { database };
