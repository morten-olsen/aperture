import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'triggers',
  schema: {
    triggers_triggers: z.object({
      id: z.string(),
      userId: z.string(),
      name: z.string(),
      goal: z.string(),
      model: z.string(),
      schedule_type: z.string(),
      schedule_value: z.string(),
      status: z.string(),
      setup_context: z.string().nullable(),
      invocation_count: z.number(),
      last_invoked_at: z.string().nullable(),
      next_invocation_at: z.string().nullable(),
      continuation: z.string().nullable(),
      continuation_updated_at: z.string().nullable(),
      max_invocations: z.number().nullable(),
      ends_at: z.string().nullable(),
      last_error: z.string().nullable(),
      consecutive_failures: z.number(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
    triggers_prompts: z.object({
      trigger_id: z.string(),
      prompt_id: z.string(),
      invoked_at: z.string(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('triggers_triggers')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('userId', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('name', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('goal', 'text', (cb) => cb.notNull())
          .addColumn('model', 'varchar(255)', (cb) => cb.notNull().defaultTo(''))
          .addColumn('schedule_type', 'varchar(50)', (cb) => cb.notNull())
          .addColumn('schedule_value', 'text', (cb) => cb.notNull())
          .addColumn('status', 'varchar(50)', (cb) => cb.notNull().defaultTo('active'))
          .addColumn('setup_context', 'text')
          .addColumn('invocation_count', 'integer', (cb) => cb.notNull().defaultTo(0))
          .addColumn('last_invoked_at', 'text')
          .addColumn('next_invocation_at', 'text')
          .addColumn('continuation', 'text')
          .addColumn('continuation_updated_at', 'text')
          .addColumn('max_invocations', 'integer')
          .addColumn('ends_at', 'text')
          .addColumn('last_error', 'text')
          .addColumn('consecutive_failures', 'integer', (cb) => cb.notNull().defaultTo(0))
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createTable('triggers_prompts')
          .addColumn('trigger_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('prompt_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('invoked_at', 'text', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
