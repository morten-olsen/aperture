import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'ssh',
  schema: {
    ssh_hosts: z.object({
      user_id: z.string(),
      id: z.string(),
      hostname: z.string(),
      port: z.string(),
      username: z.string(),
      created_at: z.string(),
    }),
    ssh_rules: z.object({
      user_id: z.string(),
      pattern: z.string(),
      host: z.string(),
      type: z.string(),
      created_at: z.string(),
    }),
    ssh_keypairs: z.object({
      user_id: z.string(),
      private_key: z.string(),
      public_key: z.string(),
      created_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-20-init': {
      up: async (db) => {
        await db.schema
          .createTable('ssh_hosts')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('hostname', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('port', 'varchar(10)', (cb) => cb.notNull())
          .addColumn('username', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .addPrimaryKeyConstraint('ssh_hosts_pk', ['user_id', 'id'])
          .execute();

        await db.schema
          .createTable('ssh_rules')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('pattern', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('host', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('type', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .addPrimaryKeyConstraint('ssh_rules_pk', ['user_id', 'pattern', 'host'])
          .execute();

        await db.schema
          .createTable('ssh_keypairs')
          .addColumn('user_id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('private_key', 'text', (cb) => cb.notNull())
          .addColumn('public_key', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
