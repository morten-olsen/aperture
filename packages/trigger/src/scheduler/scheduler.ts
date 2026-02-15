import { Cron } from 'croner';
import type { Services, Prompt } from '@morten-olsen/agentic-core';
import { PromptService } from '@morten-olsen/agentic-core';

import type { Trigger, TriggerCreateInput, TriggerListInput, TriggerUpdateInput } from '../schemas/schemas.js';
import { TriggerRepo } from '../repo/repo.js';

class TriggerScheduler {
  #services: Services;
  #triggers = new Map<string, Trigger>();
  #jobs = new Map<string, Cron>();

  constructor(services: Services) {
    this.#services = services;
  }

  #repo = () => this.#services.get(TriggerRepo);

  #clearJob = (id: string) => {
    const existing = this.#jobs.get(id);
    if (existing) {
      existing.stop();
      this.#jobs.delete(id);
    }
  };

  #scheduleTrigger = (trigger: Trigger) => {
    this.#clearJob(trigger.id);

    if (trigger.status !== 'active') {
      return;
    }

    const callback = () => {
      void this.#onTriggerFire(trigger.id);
    };

    let job: Cron;
    if (trigger.scheduleType === 'cron') {
      job = new Cron(trigger.scheduleValue, { protect: true }, callback);
    } else {
      const fireDate = new Date(trigger.scheduleValue);
      if (fireDate.getTime() <= Date.now()) {
        callback();
        return;
      }
      job = new Cron(fireDate, callback);
    }

    this.#jobs.set(trigger.id, job);

    const nextRun = job.nextRun();
    if (nextRun) {
      const nextInvocationAt = nextRun.toISOString();
      const current = this.#triggers.get(trigger.id);
      if (current) {
        this.#triggers.set(trigger.id, { ...current, nextInvocationAt });
      }
      void this.#repo().update(trigger.id, { next_invocation_at: nextInvocationAt });
    }
  };

  #complete = async (id: string) => {
    const existing = this.#triggers.get(id);
    if (!existing) {
      return;
    }
    const now = new Date().toISOString();
    await this.#repo().update(id, { status: 'completed', updated_at: now });
    this.#triggers.set(id, { ...existing, status: 'completed', updatedAt: now });
    this.#clearJob(id);
  };

  #onTriggerFire = async (id: string) => {
    try {
      await this.invoke(id);
    } catch {
      const trigger = this.#triggers.get(id);
      if (trigger?.status === 'failed') {
        this.#clearJob(id);
      }
      return;
    }

    const trigger = this.#triggers.get(id);
    if (!trigger) {
      return;
    }

    if (trigger.scheduleType === 'once') {
      await this.#complete(id);
      return;
    }

    const shouldTerminate =
      (trigger.maxInvocations !== null && trigger.invocationCount >= trigger.maxInvocations) ||
      (trigger.endsAt !== null && new Date(trigger.endsAt).getTime() <= Date.now());

    if (shouldTerminate) {
      await this.#complete(id);
      return;
    }

    const job = this.#jobs.get(id);
    const nextRun = job?.nextRun();
    if (nextRun) {
      const nextInvocationAt = nextRun.toISOString();
      this.#triggers.set(id, { ...trigger, nextInvocationAt });
      void this.#repo().update(id, { next_invocation_at: nextInvocationAt });
    }
  };

  public load = async (): Promise<void> => {
    const triggers = await this.#repo().getAll();
    this.#triggers.clear();
    for (const trigger of triggers) {
      this.#triggers.set(trigger.id, trigger);
    }
  };

  public start = (): void => {
    for (const trigger of this.#triggers.values()) {
      this.#scheduleTrigger(trigger);
    }
  };

  public stop = (): void => {
    for (const [id, job] of this.#jobs) {
      job.stop();
      this.#jobs.delete(id);
    }
  };

  public create = async (input: TriggerCreateInput): Promise<Trigger> => {
    const trigger = await this.#repo().create(input);
    this.#triggers.set(trigger.id, trigger);
    this.#scheduleTrigger(trigger);
    return trigger;
  };

  public get = async (id: string): Promise<Trigger | undefined> => {
    return this.#triggers.get(id);
  };

  public list = async (input: TriggerListInput = {}): Promise<Trigger[]> => {
    let results = Array.from(this.#triggers.values());

    if (input.status) {
      results = results.filter((t) => t.status === input.status);
    }

    return results.slice(0, input.limit ?? 50);
  };

  public update = async (
    id: string,
    changes: Partial<Omit<TriggerUpdateInput, 'triggerId'>>,
  ): Promise<Trigger | undefined> => {
    const existing = this.#triggers.get(id);
    if (!existing) {
      return undefined;
    }

    const now = new Date().toISOString();

    const dbUpdates: Record<string, unknown> = { updated_at: now };
    const memUpdates: Partial<Trigger> = { updatedAt: now };

    if (changes.name !== undefined) {
      dbUpdates['name'] = changes.name;
      memUpdates.name = changes.name;
    }
    if (changes.goal !== undefined) {
      dbUpdates['goal'] = changes.goal;
      memUpdates.goal = changes.goal;
    }
    if (changes.model !== undefined) {
      dbUpdates['model'] = changes.model;
      memUpdates.model = changes.model;
    }
    if (changes.scheduleType !== undefined) {
      dbUpdates['schedule_type'] = changes.scheduleType;
      memUpdates.scheduleType = changes.scheduleType;
    }
    if (changes.scheduleValue !== undefined) {
      dbUpdates['schedule_value'] = changes.scheduleValue;
      memUpdates.scheduleValue = changes.scheduleValue;
    }
    if (changes.setupContext !== undefined) {
      dbUpdates['setup_context'] = changes.setupContext;
      memUpdates.setupContext = changes.setupContext;
    }
    if (changes.maxInvocations !== undefined) {
      dbUpdates['max_invocations'] = changes.maxInvocations;
      memUpdates.maxInvocations = changes.maxInvocations;
    }
    if (changes.endsAt !== undefined) {
      dbUpdates['ends_at'] = changes.endsAt;
      memUpdates.endsAt = changes.endsAt;
    }
    if (changes.status !== undefined) {
      dbUpdates['status'] = changes.status;
      memUpdates.status = changes.status;
    }
    if (changes.continuation !== undefined) {
      dbUpdates['continuation'] = changes.continuation;
      dbUpdates['continuation_updated_at'] = changes.continuation === null ? null : now;
      memUpdates.continuation = changes.continuation;
      memUpdates.continuationUpdatedAt = changes.continuation === null ? null : now;
    }

    await this.#repo().update(id, dbUpdates);

    const updated = { ...existing, ...memUpdates };
    this.#triggers.set(id, updated);

    if (changes.scheduleType !== undefined || changes.scheduleValue !== undefined || changes.status !== undefined) {
      this.#scheduleTrigger(updated);
    }

    return updated;
  };

  public delete = async (id: string): Promise<void> => {
    this.#clearJob(id);
    await this.#repo().delete(id);
    this.#triggers.delete(id);
  };

  public recordInvocation = async (triggerId: string, promptId: string): Promise<void> => {
    await this.#repo().recordInvocation(triggerId, promptId);
  };

  public markInvoked = async (id: string): Promise<void> => {
    const existing = this.#triggers.get(id);
    const now = new Date().toISOString();
    const newCount = (existing?.invocationCount ?? 0) + 1;

    await this.#repo().update(id, {
      last_invoked_at: now,
      consecutive_failures: 0,
      invocation_count: newCount,
      updated_at: now,
    });

    if (existing) {
      this.#triggers.set(id, {
        ...existing,
        lastInvokedAt: now,
        consecutiveFailures: 0,
        invocationCount: newCount,
        updatedAt: now,
      });
    }
  };

  public invoke = async (id: string, model?: string): Promise<Prompt> => {
    const trigger = this.#triggers.get(id);
    if (!trigger) {
      throw new Error(`Trigger ${id} not found`);
    }

    const resolvedModel = model ?? trigger.model;
    if (!resolvedModel) {
      throw new Error(`No model specified for trigger ${id}`);
    }

    const promptService = this.#services.get(PromptService);
    const completion = promptService.create({
      model: resolvedModel,
      state: {
        trigger: { from: { id: trigger.id, type: trigger.scheduleType } },
      },
    });

    try {
      const prompt = await completion.run();
      await this.markInvoked(id);
      await this.recordInvocation(id, prompt.id);
      return prompt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markFailed(id, message);
      throw error;
    }
  };

  public markFailed = async (id: string, error: string): Promise<void> => {
    const existing = this.#triggers.get(id);
    const now = new Date().toISOString();
    const newFailures = (existing?.consecutiveFailures ?? 0) + 1;

    const dbUpdates: Record<string, unknown> = {
      last_error: error,
      consecutive_failures: newFailures,
      updated_at: now,
    };

    if (newFailures >= 3) {
      dbUpdates['status'] = 'failed';
    }

    await this.#repo().update(id, dbUpdates);

    if (existing) {
      const updated = {
        ...existing,
        lastError: error,
        consecutiveFailures: newFailures,
        updatedAt: now,
        ...(newFailures >= 3 ? { status: 'failed' as const } : {}),
      };
      this.#triggers.set(id, updated);

      if (updated.status === 'failed') {
        this.#clearJob(id);
      }
    }
  };
}

export { TriggerScheduler };
