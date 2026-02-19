import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const database = createDatabase({
  id: 'todo',
  schema: {
    todo_tasks: z.object({
      id: z.string(),
      user_id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      priority: z.string(),
      parent_id: z.string().nullable(),
      position: z.number(),
      project: z.string().nullable(),
      agent_notes: z.string().nullable(),
      starts_at: z.string().nullable(),
      due_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
    todo_tags: z.object({
      id: z.string(),
      task_id: z.string(),
      tag: z.string(),
    }),
  },
  migrations: {
    '2026-02-19-init': {
      up: async (db) => {
        await db.schema
          .createTable('todo_tasks')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('title', 'varchar(500)', (cb) => cb.notNull())
          .addColumn('description', 'text')
          .addColumn('status', 'varchar(50)', (cb) => cb.notNull().defaultTo('pending'))
          .addColumn('priority', 'varchar(50)', (cb) => cb.notNull().defaultTo('medium'))
          .addColumn('parent_id', 'varchar(255)')
          .addColumn('position', 'integer', (cb) => cb.notNull().defaultTo(0))
          .addColumn('project', 'varchar(255)')
          .addColumn('agent_notes', 'text')
          .addColumn('starts_at', 'text')
          .addColumn('due_at', 'text')
          .addColumn('completed_at', 'text')
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createTable('todo_tags')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('task_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('tag', 'varchar(255)', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { database };
