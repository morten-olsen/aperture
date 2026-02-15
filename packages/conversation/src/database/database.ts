import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';

const conversationDatabase = createDatabase({
  id: 'conversation',
  schema: {
    conversation_users: z.object({
      id: z.string(),
      active_conversation_id: z.string().nullable(),
      created_at: z.string(),
    }),
    conversation_conversations: z.object({
      id: z.string(),
      user_id: z.string(),
      state: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
    conversation_prompts: z.object({
      conversation_id: z.string(),
      prompt_id: z.string(),
    }),
  },
  migrations: {
    '2026-02-15-init': {
      up: async (db) => {
        await db.schema
          .createTable('conversation_users')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('active_conversation_id', 'varchar(255)')
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createTable('conversation_conversations')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('user_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('state', 'text')
          .addColumn('created_at', 'text', (cb) => cb.notNull())
          .addColumn('updated_at', 'text', (cb) => cb.notNull())
          .execute();

        await db.schema
          .createTable('conversation_prompts')
          .addColumn('conversation_id', 'varchar(255)', (cb) => cb.notNull())
          .addColumn('prompt_id', 'varchar(255)', (cb) => cb.notNull())
          .execute();
      },
    },
  },
});

export { conversationDatabase };
