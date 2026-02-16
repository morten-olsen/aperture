import { randomUUID } from 'node:crypto';

import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import type { Trigger, TriggerCreateInput } from '../schemas/schemas.js';
import { database } from '../database/database.js';

type TriggerRow = {
  id: string;
  userId: string;
  name: string;
  goal: string;
  model: 'normal' | 'high';
  schedule_type: string;
  schedule_value: string;
  status: string;
  setup_context: string | null;
  invocation_count: number;
  last_invoked_at: string | null;
  next_invocation_at: string | null;
  continuation: string | null;
  continuation_updated_at: string | null;
  max_invocations: number | null;
  ends_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
};

class TriggerRepo {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);
    return db;
  };

  #rowToTrigger = (row: TriggerRow): Trigger => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    goal: row.goal,
    model: row.model,
    scheduleType: row.schedule_type as 'once' | 'cron',
    scheduleValue: row.schedule_value,
    status: row.status as Trigger['status'],
    setupContext: row.setup_context,
    invocationCount: row.invocation_count,
    lastInvokedAt: row.last_invoked_at,
    nextInvocationAt: row.next_invocation_at,
    continuation: row.continuation,
    continuationUpdatedAt: row.continuation_updated_at,
    maxInvocations: row.max_invocations,
    endsAt: row.ends_at,
    lastError: row.last_error,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  public create = async (input: TriggerCreateInput): Promise<Trigger> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();
    const id = randomUUID();

    await db
      .insertInto('triggers_triggers')
      .values({
        id,
        userId: input.userId,
        name: input.name,
        goal: input.goal,
        model: input.model,
        schedule_type: input.scheduleType,
        schedule_value: input.scheduleValue,
        status: 'active',
        setup_context: input.setupContext ?? null,
        invocation_count: 0,
        last_invoked_at: null,
        next_invocation_at: null,
        continuation: null,
        continuation_updated_at: null,
        max_invocations: input.maxInvocations ?? null,
        ends_at: input.endsAt ?? null,
        last_error: null,
        consecutive_failures: 0,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const trigger: Trigger = {
      id,
      userId: input.userId,
      name: input.name,
      goal: input.goal,
      model: input.model,
      scheduleType: input.scheduleType,
      scheduleValue: input.scheduleValue,
      status: 'active',
      setupContext: input.setupContext ?? null,
      invocationCount: 0,
      lastInvokedAt: null,
      nextInvocationAt: null,
      continuation: null,
      continuationUpdatedAt: null,
      maxInvocations: input.maxInvocations ?? null,
      endsAt: input.endsAt ?? null,
      lastError: null,
      consecutiveFailures: 0,
      createdAt: now,
      updatedAt: now,
    };

    return trigger;
  };

  public getAll = async (): Promise<Trigger[]> => {
    const db = await this.#getDb();
    const rows = await db.selectFrom('triggers_triggers').selectAll().execute();
    return rows.map((row) => this.#rowToTrigger(row as TriggerRow));
  };

  public update = async (id: string, columns: Record<string, unknown>): Promise<void> => {
    const db = await this.#getDb();
    await db.updateTable('triggers_triggers').set(columns).where('id', '=', id).execute();
  };

  public delete = async (id: string): Promise<void> => {
    const db = await this.#getDb();
    await db.deleteFrom('triggers_prompts').where('trigger_id', '=', id).execute();
    await db.deleteFrom('triggers_triggers').where('id', '=', id).execute();
  };

  public recordInvocation = async (triggerId: string, promptId: string): Promise<void> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();

    await db
      .insertInto('triggers_prompts')
      .values({
        trigger_id: triggerId,
        prompt_id: promptId,
        invoked_at: now,
      })
      .execute();
  };
}

export { TriggerRepo };
export type { TriggerRow };
