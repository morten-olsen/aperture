import { DatabaseService } from '@morten-olsen/agentic-database';
import { database } from '../database/database.js';
class TelegramChatRepo {
    #services;
    constructor(services) {
        this.#services = services;
    }
    #getDb = async () => {
        const databaseService = this.#services.get(DatabaseService);
        const db = await databaseService.get(database);
        return db;
    };
    #rowToChat = (row) => ({
        id: row.id,
        telegramChatId: row.telegram_chat_id,
        chatType: row.chat_type,
        title: row.title,
        username: row.username,
        firstName: row.first_name,
        model: row.model,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
    upsert = async (chat) => {
        const db = await this.#getDb();
        const now = new Date().toISOString();
        const existing = await db.selectFrom('telegram_chats').selectAll().where('id', '=', chat.id).executeTakeFirst();
        if (existing) {
            await db
                .updateTable('telegram_chats')
                .set({
                telegram_chat_id: chat.telegramChatId,
                chat_type: chat.chatType,
                title: chat.title,
                username: chat.username,
                first_name: chat.firstName,
                updated_at: now,
            })
                .where('id', '=', chat.id)
                .execute();
        }
        else {
            await db
                .insertInto('telegram_chats')
                .values({
                id: chat.id,
                telegram_chat_id: chat.telegramChatId,
                chat_type: chat.chatType,
                title: chat.title,
                username: chat.username,
                first_name: chat.firstName,
                model: chat.model,
                created_at: now,
                updated_at: now,
            })
                .execute();
        }
    };
    get = async (id) => {
        const db = await this.#getDb();
        const row = await db.selectFrom('telegram_chats').selectAll().where('id', '=', id).executeTakeFirst();
        if (!row)
            return undefined;
        return this.#rowToChat(row);
    };
    getByTelegramId = async (telegramChatId) => {
        const db = await this.#getDb();
        const row = await db
            .selectFrom('telegram_chats')
            .selectAll()
            .where('telegram_chat_id', '=', telegramChatId)
            .executeTakeFirst();
        if (!row)
            return undefined;
        return this.#rowToChat(row);
    };
    list = async () => {
        const db = await this.#getDb();
        const rows = await db.selectFrom('telegram_chats').selectAll().execute();
        return rows.map((row) => this.#rowToChat(row));
    };
    updateModel = async (id, model) => {
        const db = await this.#getDb();
        const now = new Date().toISOString();
        await db.updateTable('telegram_chats').set({ model, updated_at: now }).where('id', '=', id).execute();
    };
}
export { TelegramChatRepo };
//# sourceMappingURL=repo.js.map