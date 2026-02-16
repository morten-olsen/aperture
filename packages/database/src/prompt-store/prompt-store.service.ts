import type { Prompt, Services } from '@morten-olsen/agentic-core';
import { PromptService } from '@morten-olsen/agentic-core';

import { DatabaseService } from '../database/database.service.js';

import { promptStoreDatabase } from './prompt-store.database.js';

type PromptRow = {
  id: string;
  model: 'normal' | 'high';
  userId: string;
  visible: number;
  state: string;
  input: string | null;
  output: string;
  created_at: string;
  completed_at: string | null;
};

type PromptSearchOptions = {
  ids?: string[];
  before?: string;
  after?: string;
  limit?: number;
  offset?: number;
};

class PromptStoreService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(promptStoreDatabase);
  };

  #rowToPrompt = (row: PromptRow): Prompt => ({
    id: row.id,
    userId: row.userId,
    model: row.model,
    visible: row.visible === 1,
    state: row.state as Prompt['state'],
    input: row.input ?? undefined,
    output: JSON.parse(row.output),
  });

  #promptToRow = (prompt: Prompt): PromptRow => ({
    id: prompt.id,
    userId: prompt.userId,
    model: prompt.model,
    visible: prompt.visible === false ? 0 : 1,
    state: prompt.state,
    input: prompt.input ?? null,
    output: JSON.stringify(prompt.output),
    created_at: new Date().toISOString(),
    completed_at: null,
  });

  public listen = () => {
    const promptService = this.#services.get(PromptService);
    promptService.on('created', async (completion) => {
      const db = await this.#getDb();
      const row = this.#promptToRow(completion.prompt);
      await db.insertInto('db_prompts').values(row).execute();

      completion.on('completed', async () => {
        const db = await this.#getDb();
        await db
          .updateTable('db_prompts')
          .set({
            state: completion.prompt.state,
            output: JSON.stringify(completion.prompt.output),
            completed_at: new Date().toISOString(),
          })
          .where('id', '=', completion.id)
          .execute();
      });
    });
  };

  public insert = async (prompt: Prompt) => {
    const db = await this.#getDb();
    const row = this.#promptToRow(prompt);
    await db.insertInto('db_prompts').values(row).execute();
  };

  public getById = async (id: string): Promise<Prompt | undefined> => {
    const db = await this.#getDb();
    const row = await db.selectFrom('db_prompts').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return this.#rowToPrompt(row as PromptRow);
  };

  public getByIds = async (ids: string[]): Promise<Prompt[]> => {
    if (ids.length === 0) {
      return [];
    }
    const db = await this.#getDb();
    const rows = await db.selectFrom('db_prompts').selectAll().where('id', 'in', ids).execute();
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => rowMap.get(id))
      .filter((r): r is PromptRow => r != null)
      .map(this.#rowToPrompt);
  };

  public search = async (options: PromptSearchOptions = {}): Promise<Prompt[]> => {
    const { ids, before, after, limit = 50, offset = 0 } = options;
    const db = await this.#getDb();
    let query = db.selectFrom('db_prompts').selectAll().orderBy('created_at', 'desc');

    if (ids && ids.length > 0) {
      query = query.where('id', 'in', ids);
    }
    if (before) {
      query = query.where('created_at', '<', before);
    }
    if (after) {
      query = query.where('created_at', '>', after);
    }

    query = query.limit(limit).offset(offset);
    const rows = await query.execute();
    return rows.map((r) => this.#rowToPrompt(r as PromptRow));
  };
}

export type { PromptSearchOptions };
export { PromptStoreService };
