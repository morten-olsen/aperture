import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';

type PersonalityRow = {
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type Personality = {
  content: string;
  updatedAt: string;
};

class PersonalityRepo {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);
    return db;
  };

  get = async (userId: string): Promise<Personality | undefined> => {
    const db = await this.#getDb();
    const row = await db.selectFrom('personality_entries').selectAll().where('user_id', '=', userId).executeTakeFirst();

    if (!row) return undefined;
    const typed = row as PersonalityRow;
    return {
      content: typed.content,
      updatedAt: typed.updated_at,
    };
  };

  set = async (userId: string, content: string): Promise<void> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();
    const existing = await this.get(userId);

    if (existing) {
      await db
        .updateTable('personality_entries')
        .set({ content, updated_at: now })
        .where('user_id', '=', userId)
        .execute();
    } else {
      await db
        .insertInto('personality_entries')
        .values({
          user_id: userId,
          content,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }
  };
}

export { PersonalityRepo };
export type { Personality, PersonalityRow };
