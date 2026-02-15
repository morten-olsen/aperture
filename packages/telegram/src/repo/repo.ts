import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import type { TelegramChat } from '../schemas/schemas.js';
import { database } from '../database/database.js';

type TelegramChatRow = {
  id: string;
  telegram_chat_id: string;
  chat_type: string;
  title: string | null;
  username: string | null;
  first_name: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

class TelegramChatRepo {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);
    return db;
  };

  #rowToChat = (row: TelegramChatRow): TelegramChat => ({
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    chatType: row.chat_type as TelegramChat['chatType'],
    title: row.title,
    username: row.username,
    firstName: row.first_name,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  public upsert = async (chat: Omit<TelegramChat, 'createdAt' | 'updatedAt'>): Promise<void> => {
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
    } else {
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

  public get = async (id: string): Promise<TelegramChat | undefined> => {
    const db = await this.#getDb();
    const row = await db.selectFrom('telegram_chats').selectAll().where('id', '=', id).executeTakeFirst();

    if (!row) return undefined;
    return this.#rowToChat(row as TelegramChatRow);
  };

  public getByTelegramId = async (telegramChatId: string): Promise<TelegramChat | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('telegram_chats')
      .selectAll()
      .where('telegram_chat_id', '=', telegramChatId)
      .executeTakeFirst();

    if (!row) return undefined;
    return this.#rowToChat(row as TelegramChatRow);
  };

  public list = async (): Promise<TelegramChat[]> => {
    const db = await this.#getDb();
    const rows = await db.selectFrom('telegram_chats').selectAll().execute();
    return rows.map((row) => this.#rowToChat(row as TelegramChatRow));
  };

  public updateModel = async (id: string, model: string | null): Promise<void> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();
    await db.updateTable('telegram_chats').set({ model, updated_at: now }).where('id', '=', id).execute();
  };
}

export { TelegramChatRepo };
export type { TelegramChatRow };
