import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { sql } from 'kysely';

import { conversationDatabase } from '../database/database.js';

type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  active_conversation_id: string | null;
  created_at: string;
};

class ConversationRepo {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(conversationDatabase);
  };

  public upsert = async (id: string, userId: string, state?: Record<string, unknown>) => {
    const db = await this.#getDb();
    const now = new Date().toISOString();
    const existing = await db
      .selectFrom('conversation_conversations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('conversation_conversations')
        .set({
          user_id: userId,
          state: state ? JSON.stringify(state) : existing.state,
          updated_at: now,
        })
        .where('id', '=', id)
        .execute();
    } else {
      await db
        .insertInto('conversation_conversations')
        .values({
          id,
          user_id: userId,
          state: state ? JSON.stringify(state) : null,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }
  };

  public get = async (id: string): Promise<ConversationRow | undefined> => {
    const db = await this.#getDb();
    const row = await db.selectFrom('conversation_conversations').selectAll().where('id', '=', id).executeTakeFirst();
    return row as ConversationRow | undefined;
  };

  public list = async (userId: string): Promise<ConversationRow[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('conversation_conversations')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('updated_at', 'desc')
      .execute();
    return rows as ConversationRow[];
  };

  public updateState = async (id: string, state: Record<string, unknown>) => {
    const db = await this.#getDb();
    await db
      .updateTable('conversation_conversations')
      .set({
        state: JSON.stringify(state),
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .execute();
  };

  public updateTitle = async (id: string, title: string) => {
    const db = await this.#getDb();
    await db
      .updateTable('conversation_conversations')
      .set({
        title,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .execute();
  };

  public addPrompt = async (conversationId: string, promptId: string) => {
    const db = await this.#getDb();
    await db
      .insertInto('conversation_prompts')
      .values({
        conversation_id: conversationId,
        prompt_id: promptId,
      })
      .execute();
  };

  public getPromptIds = async (conversationId: string): Promise<string[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('conversation_prompts')
      .select('prompt_id')
      .where('conversation_id', '=', conversationId)
      .orderBy(sql`rowid`, 'asc')
      .execute();
    return rows.map((r) => r.prompt_id);
  };

  public ensureUser = async (userId: string) => {
    const db = await this.#getDb();
    const existing = await db.selectFrom('conversation_users').selectAll().where('id', '=', userId).executeTakeFirst();
    if (!existing) {
      await db
        .insertInto('conversation_users')
        .values({
          id: userId,
          active_conversation_id: null,
          created_at: new Date().toISOString(),
        })
        .execute();
    }
  };

  public getUser = async (userId: string): Promise<UserRow | undefined> => {
    const db = await this.#getDb();
    const row = await db.selectFrom('conversation_users').selectAll().where('id', '=', userId).executeTakeFirst();
    return row as UserRow | undefined;
  };

  public delete = async (id: string) => {
    const db = await this.#getDb();
    await db.deleteFrom('conversation_prompts').where('conversation_id', '=', id).execute();
    await db.deleteFrom('conversation_conversations').where('id', '=', id).execute();
    await db
      .updateTable('conversation_users')
      .set({ active_conversation_id: null })
      .where('active_conversation_id', '=', id)
      .execute();
  };

  public setActiveConversation = async (userId: string, conversationId: string | null) => {
    const db = await this.#getDb();
    await db
      .updateTable('conversation_users')
      .set({ active_conversation_id: conversationId })
      .where('id', '=', userId)
      .execute();
  };
}

export type { ConversationRow, UserRow };
export { ConversationRepo };
