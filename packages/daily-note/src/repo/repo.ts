import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';

type DailyNoteRow = {
  user_id: string;
  date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type DailyNote = {
  userId: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

class DailyNoteRepo {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);
    return db;
  };

  #rowToNote = (row: DailyNoteRow): DailyNote => ({
    userId: row.user_id,
    date: row.date,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  get = async (userId: string, date: string): Promise<DailyNote | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('daily_note_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .where('date', '=', date)
      .executeTakeFirst();

    if (!row) return undefined;
    return this.#rowToNote(row as DailyNoteRow);
  };

  set = async (userId: string, date: string, content: string): Promise<DailyNote> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();
    const existing = await this.get(userId, date);

    if (existing) {
      await db
        .updateTable('daily_note_entries')
        .set({ content, updated_at: now })
        .where('user_id', '=', userId)
        .where('date', '=', date)
        .execute();
    } else {
      await db
        .insertInto('daily_note_entries')
        .values({
          user_id: userId,
          date,
          content,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }

    return {
      userId,
      date,
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  };

  list = async (userId: string, options: { from?: string; to?: string; limit?: number } = {}): Promise<DailyNote[]> => {
    const db = await this.#getDb();
    const { from, to, limit = 14 } = options;

    let query = db
      .selectFrom('daily_note_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(limit);

    if (from) {
      query = query.where('date', '>=', from);
    }
    if (to) {
      query = query.where('date', '<=', to);
    }

    const rows = await query.execute();
    return rows.map((row) => this.#rowToNote(row as DailyNoteRow));
  };
}

export { DailyNoteRepo };
export type { DailyNote, DailyNoteRow };
