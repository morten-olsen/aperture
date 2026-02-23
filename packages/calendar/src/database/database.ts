import { sql } from 'kysely';
import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'calendar',
  schema: {
    calendar_events: z.object({
      uid: z.string(),
      master_uid: z.string(),
      calendar_id: z.string(),
      user_id: z.string(),
      summary: z.string(),
      description: z.string().nullable(),
      location: z.string().nullable(),
      start_at: z.string(),
      end_at: z.string(),
      all_day: z.number(),
      is_recurring: z.number(),
      recurrence_id: z.string().nullable(),
      raw_ical: z.string(),
      etag: z.string(),
      synced_at: z.string(),
    }),
    calendar_notes: z.object({
      id: z.string(),
      event_uid: z.string(),
      user_id: z.string(),
      content: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('calendar_events')
          .addColumn('uid', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('master_uid', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('calendar_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('summary', 'text', (cb) => cb.notNull())
          .addColumn('description', 'text')
          .addColumn('location', 'text')
          .addColumn('start_at', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('end_at', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('all_day', 'integer', (cb) => cb.notNull().defaultTo(0))
          .addColumn('is_recurring', 'integer', (cb) => cb.notNull().defaultTo(0))
          .addColumn('recurrence_id', 'varchar(255)')
          .addColumn('raw_ical', 'text', (cb) => cb.notNull())
          .addColumn('etag', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('synced_at', 'varchar(255)', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createTable('calendar_notes')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('event_uid', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('content', 'text', (cb) => cb.notNull())
          .addColumn('created_at', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('updated_at', 'varchar(255)', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createIndex('calendar_events_calendar_id_idx')
          .on('calendar_events')
          .column('calendar_id')
          .execute();

        await db.schema.createIndex('calendar_events_start_at_idx').on('calendar_events').column('start_at').execute();

        await db.schema
          .createIndex('calendar_events_master_uid_idx')
          .on('calendar_events')
          .column('master_uid')
          .execute();

        await db.schema.createIndex('calendar_events_user_id_idx').on('calendar_events').column('user_id').execute();

        await db.schema.createIndex('calendar_notes_event_uid_idx').on('calendar_notes').column('event_uid').execute();

        await db.schema.createIndex('calendar_notes_user_id_idx').on('calendar_notes').column('user_id').execute();
      },
    },
    '2026-02-23-add-user-id': {
      up: async (db) => {
        const hasColumn = async (table: string, column: string) => {
          const result = await sql<{ count: number }>`
            SELECT count(*) as count FROM pragma_table_info(${table}) WHERE name = ${column}
          `.execute(db);
          return (result.rows[0]?.count ?? 0) > 0;
        };

        if (!(await hasColumn('calendar_events', 'user_id'))) {
          await db.schema
            .alterTable('calendar_events')
            .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull().defaultTo(''))
            .execute();
          await db.schema.createIndex('calendar_events_user_id_idx').on('calendar_events').column('user_id').execute();
        }

        if (!(await hasColumn('calendar_notes', 'user_id'))) {
          await db.schema
            .alterTable('calendar_notes')
            .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull().defaultTo(''))
            .execute();
          await db.schema.createIndex('calendar_notes_user_id_idx').on('calendar_notes').column('user_id').execute();
        }
      },
    },
  },
});

export { database };
