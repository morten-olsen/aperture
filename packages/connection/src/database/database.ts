import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const secretsDatabase = createDatabase({
  id: 'secrets',
  schema: {
    secrets_values: z.object({
      id: z.string(),
      user_id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      value: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-23-init': {
      up: async (db) => {
        await db.schema
          .createTable('secrets_values')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('name', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('description', 'text')
          .addColumn('value', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

const connectionsDatabase = createDatabase({
  id: 'connections',
  schema: {
    connections_connections: z.object({
      id: z.string(),
      user_id: z.string(),
      type: z.string(),
      name: z.string(),
      fields: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-23-init': {
      up: async (db) => {
        await db.schema
          .createTable('connections_connections')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('type', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('name', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('fields', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { secretsDatabase, connectionsDatabase };
