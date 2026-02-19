import type { Prompt, Services } from '@morten-olsen/agentic-core';
import { PromptService } from '@morten-olsen/agentic-core';
import { sql } from 'kysely';

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
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  cost: number | null;
  resolved_model: string | null;
};

type PromptSearchOptions = {
  ids?: string[];
  before?: string;
  after?: string;
  limit?: number;
  offset?: number;
};

type UsageQueryOptions = {
  userId?: string;
  after?: string;
  before?: string;
  resolvedModel?: string;
};

type UsageModelBreakdown = {
  resolvedModel: string;
  promptCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cost: number | null;
};

type UsageSummary = {
  promptCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cost: number | null;
  byModel: UsageModelBreakdown[];
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
    usage:
      row.total_tokens != null
        ? {
            inputTokens: row.input_tokens ?? 0,
            outputTokens: row.output_tokens ?? 0,
            totalTokens: row.total_tokens,
            reasoningTokens: row.reasoning_tokens ?? undefined,
            cost: row.cost ?? undefined,
            resolvedModel: row.resolved_model ?? undefined,
          }
        : undefined,
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
    input_tokens: prompt.usage?.inputTokens ?? null,
    output_tokens: prompt.usage?.outputTokens ?? null,
    total_tokens: prompt.usage?.totalTokens ?? null,
    reasoning_tokens: prompt.usage?.reasoningTokens ?? null,
    cost: prompt.usage?.cost ?? null,
    resolved_model: prompt.usage?.resolvedModel ?? null,
  });

  #usageFromPrompt = (prompt: Prompt) => {
    const usage: Partial<PromptRow> = {};
    if (prompt.usage) {
      usage.input_tokens = prompt.usage.inputTokens;
      usage.output_tokens = prompt.usage.outputTokens;
      usage.total_tokens = prompt.usage.totalTokens;
      usage.reasoning_tokens = prompt.usage.reasoningTokens ?? null;
      usage.cost = prompt.usage.cost ?? null;
      usage.resolved_model = prompt.usage.resolvedModel ?? null;
    }
    return usage;
  };

  public listen = () => {
    const promptService = this.#services.get(PromptService);
    promptService.on('created', async (completion) => {
      const db = await this.#getDb();
      const row = this.#promptToRow(completion.prompt);
      await db.insertInto('db_prompts').values(row).execute();

      completion.on('updated', async () => {
        if (completion.prompt.state !== 'waiting_for_approval') return;
        const db = await this.#getDb();
        await db
          .updateTable('db_prompts')
          .set({
            state: completion.prompt.state,
            output: JSON.stringify(completion.prompt.output),
          })
          .where('id', '=', completion.id)
          .execute();
      });

      completion.on('completed', async () => {
        const db = await this.#getDb();
        await db
          .updateTable('db_prompts')
          .set({
            state: completion.prompt.state,
            output: JSON.stringify(completion.prompt.output),
            completed_at: new Date().toISOString(),
            ...this.#usageFromPrompt(completion.prompt),
          })
          .where('id', '=', completion.id)
          .execute();
      });
    });
  };

  public recoverPending = async (): Promise<Prompt[]> => {
    const db = await this.#getDb();
    const rows = await db.selectFrom('db_prompts').selectAll().where('state', '=', 'waiting_for_approval').execute();
    return rows.map((r) => this.#rowToPrompt(r as PromptRow));
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

  public getUsageSummary = async (options: UsageQueryOptions = {}): Promise<UsageSummary> => {
    const { userId, after, before, resolvedModel } = options;
    const db = await this.#getDb();

    let query = db
      .selectFrom('db_prompts')
      .select([
        sql<number>`count(*)`.as('prompt_count'),
        sql<number>`coalesce(sum(input_tokens), 0)`.as('input_tokens'),
        sql<number>`coalesce(sum(output_tokens), 0)`.as('output_tokens'),
        sql<number>`coalesce(sum(total_tokens), 0)`.as('total_tokens'),
        sql<number>`coalesce(sum(reasoning_tokens), 0)`.as('reasoning_tokens'),
        sql<number | null>`sum(cost)`.as('cost'),
      ])
      .where('total_tokens', 'is not', null);

    if (userId) {
      query = query.where('userId', '=', userId);
    }
    if (after) {
      query = query.where('created_at', '>', after);
    }
    if (before) {
      query = query.where('created_at', '<', before);
    }
    if (resolvedModel) {
      query = query.where('resolved_model', '=', resolvedModel);
    }

    const totals = await query.executeTakeFirstOrThrow();

    let modelQuery = db
      .selectFrom('db_prompts')
      .select([
        'resolved_model',
        sql<number>`count(*)`.as('prompt_count'),
        sql<number>`coalesce(sum(input_tokens), 0)`.as('input_tokens'),
        sql<number>`coalesce(sum(output_tokens), 0)`.as('output_tokens'),
        sql<number>`coalesce(sum(total_tokens), 0)`.as('total_tokens'),
        sql<number>`coalesce(sum(reasoning_tokens), 0)`.as('reasoning_tokens'),
        sql<number | null>`sum(cost)`.as('cost'),
      ])
      .where('total_tokens', 'is not', null)
      .where('resolved_model', 'is not', null)
      .groupBy('resolved_model');

    if (userId) {
      modelQuery = modelQuery.where('userId', '=', userId);
    }
    if (after) {
      modelQuery = modelQuery.where('created_at', '>', after);
    }
    if (before) {
      modelQuery = modelQuery.where('created_at', '<', before);
    }
    if (resolvedModel) {
      modelQuery = modelQuery.where('resolved_model', '=', resolvedModel);
    }

    const modelRows = await modelQuery.execute();

    return {
      promptCount: Number(totals.prompt_count),
      inputTokens: Number(totals.input_tokens),
      outputTokens: Number(totals.output_tokens),
      totalTokens: Number(totals.total_tokens),
      reasoningTokens: Number(totals.reasoning_tokens),
      cost: totals.cost != null ? Number(totals.cost) : null,
      byModel: modelRows.map((r) => ({
        resolvedModel: r.resolved_model as string,
        promptCount: Number(r.prompt_count),
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        totalTokens: Number(r.total_tokens),
        reasoningTokens: Number(r.reasoning_tokens),
        cost: r.cost != null ? Number(r.cost) : null,
      })),
    };
  };
}

export type { PromptSearchOptions, UsageQueryOptions, UsageSummary, UsageModelBreakdown };
export { PromptStoreService };
