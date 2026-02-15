import { createDatabase } from '@morten-olsen/agentic-database';
import { z } from 'zod';
const database = createDatabase({
    id: 'telegram',
    schema: {
        telegram_chats: z.object({
            id: z.string(),
            telegram_chat_id: z.string(),
            chat_type: z.string(),
            title: z.string().nullable(),
            username: z.string().nullable(),
            first_name: z.string().nullable(),
            model: z.string().nullable(),
            created_at: z.string(),
            updated_at: z.string(),
        }),
    },
    migrations: {
        '2026-02-15-init': {
            up: async (db) => {
                await db.schema
                    .createTable('telegram_chats')
                    .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
                    .addColumn('telegram_chat_id', 'varchar(255)', (cb) => cb.notNull())
                    .addColumn('chat_type', 'varchar(50)', (cb) => cb.notNull())
                    .addColumn('title', 'varchar(255)')
                    .addColumn('username', 'varchar(255)')
                    .addColumn('first_name', 'varchar(255)')
                    .addColumn('model', 'varchar(255)')
                    .addColumn('created_at', 'text', (cb) => cb.notNull())
                    .addColumn('updated_at', 'text', (cb) => cb.notNull())
                    .execute();
                await db.schema
                    .createIndex('idx_telegram_chats_telegram_chat_id')
                    .on('telegram_chats')
                    .column('telegram_chat_id')
                    .execute();
            },
        },
    },
});
export { database };
//# sourceMappingURL=database.js.map