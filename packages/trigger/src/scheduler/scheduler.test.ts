import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Services, PromptService } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { TriggerScheduler } from './scheduler.js';

describe('TriggerScheduler', () => {
  let services: Services;
  let scheduler: TriggerScheduler;

  beforeEach(async () => {
    services = Services.mock();
    services.get(DatabaseService);
    scheduler = services.get(TriggerScheduler);
  });

  afterEach(() => {
    scheduler.stop();
  });

  const createOnceTrigger = (overrides: { at?: string; model?: 'normal' | 'high' } = {}) =>
    scheduler.create({
      userId: 'admin',
      name: 'Test Once',
      goal: 'Test goal',
      model: overrides.model ?? 'normal',
      scheduleType: 'once',
      scheduleValue: overrides.at ?? '2026-03-15T09:00:00Z',
    });

  const createCronTrigger = (overrides: { expression?: string; model?: string; maxInvocations?: number } = {}) =>
    scheduler.create({
      userId: 'admin',
      name: 'Test Cron',
      goal: 'Monitor something',
      model: overrides.model ?? 'test-model',
      scheduleType: 'cron',
      scheduleValue: overrides.expression ?? '0 9 * * 1-5',
      setupContext: 'Check weekday mornings',
      maxInvocations: overrides.maxInvocations ?? 10,
    });

  const mockPromptService = () => {
    const promptService = services.get(PromptService);
    const fakePrompt = {
      id: 'prompt-fake',
      model: 'test-model',
      state: 'completed' as const,
      output: [],
    };
    const spy = vi.spyOn(promptService, 'create').mockReturnValue({
      run: vi.fn().mockResolvedValue(fakePrompt),
    } as never);
    return { spy, fakePrompt };
  };

  describe('create', () => {
    it('creates a once trigger with correct fields', async () => {
      const trigger = await createOnceTrigger();

      expect(trigger.id).toBeDefined();
      expect(trigger.name).toBe('Test Once');
      expect(trigger.goal).toBe('Test goal');
      expect(trigger.model).toBe('test-model');
      expect(trigger.scheduleType).toBe('once');
      expect(trigger.scheduleValue).toBe('2026-03-15T09:00:00Z');
      expect(trigger.status).toBe('active');
      expect(trigger.invocationCount).toBe(0);
      expect(trigger.consecutiveFailures).toBe(0);
      expect(trigger.continuation).toBeNull();
      expect(trigger.createdAt).toBeDefined();
      expect(trigger.updatedAt).toBeDefined();
    });

    it('creates a cron trigger with optional fields', async () => {
      const trigger = await createCronTrigger();

      expect(trigger.scheduleType).toBe('cron');
      expect(trigger.scheduleValue).toBe('0 9 * * 1-5');
      expect(trigger.setupContext).toBe('Check weekday mornings');
      expect(trigger.maxInvocations).toBe(10);
      expect(trigger.model).toBe('test-model');
    });
  });

  describe('get', () => {
    it('returns a trigger by id', async () => {
      const created = await createOnceTrigger();
      const fetched = await scheduler.get(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe('Test Once');
    });

    it('returns undefined for non-existent id', async () => {
      const result = await scheduler.get('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    it('lists all triggers', async () => {
      await createOnceTrigger();
      await createCronTrigger();

      const triggers = await scheduler.list({ userId: 'admin' });
      expect(triggers).toHaveLength(2);
    });

    it('filters by status', async () => {
      const trigger = await createOnceTrigger();
      await createCronTrigger();
      await scheduler.update(trigger.id, { status: 'paused' });

      const active = await scheduler.list({ status: 'active', userId: 'admin' });
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Test Cron');

      const paused = await scheduler.list({ status: 'paused', userId: 'admin' });
      expect(paused).toHaveLength(1);
      expect(paused[0].name).toBe('Test Once');
    });

    it('respects limit', async () => {
      await createOnceTrigger();
      await createCronTrigger();

      const limited = await scheduler.list({ limit: 1, userId: 'admin' });
      expect(limited).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('updates name and goal', async () => {
      const trigger = await createOnceTrigger();
      const updated = await scheduler.update(trigger.id, {
        name: 'Updated Name',
        goal: 'Updated goal',
      });

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.goal).toBe('Updated goal');
    });

    it('updates model', async () => {
      const trigger = await createOnceTrigger();
      const updated = await scheduler.update(trigger.id, {
        model: 'normal',
      });

      expect(updated?.model).toBe('new-model');
    });

    it('updates schedule', async () => {
      const trigger = await createOnceTrigger();
      const updated = await scheduler.update(trigger.id, {
        scheduleType: 'cron',
        scheduleValue: '*/30 * * * *',
      });

      expect(updated?.scheduleType).toBe('cron');
      expect(updated?.scheduleValue).toBe('*/30 * * * *');
    });

    it('updates continuation and sets timestamp', async () => {
      const trigger = await createOnceTrigger();
      const updated = await scheduler.update(trigger.id, {
        continuation: 'Previous run found 3 items',
      });

      expect(updated?.continuation).toBe('Previous run found 3 items');
      expect(updated?.continuationUpdatedAt).toBeDefined();
    });

    it('clears continuation and nulls timestamp', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.update(trigger.id, { continuation: 'Some note' });
      const updated = await scheduler.update(trigger.id, { continuation: null });

      expect(updated?.continuation).toBeNull();
      expect(updated?.continuationUpdatedAt).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes trigger', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.delete(trigger.id);

      const result = await scheduler.get(trigger.id);
      expect(result).toBeUndefined();
    });

    it('removes associated prompt records', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.recordInvocation(trigger.id, 'prompt-1');
      await scheduler.delete(trigger.id);

      const result = await scheduler.get(trigger.id);
      expect(result).toBeUndefined();
    });
  });

  describe('markFailed', () => {
    it('increments consecutive failures', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.markFailed(trigger.id, 'timeout');

      const updated = await scheduler.get(trigger.id);
      expect(updated?.consecutiveFailures).toBe(1);
      expect(updated?.lastError).toBe('timeout');
      expect(updated?.status).toBe('active');
    });

    it('auto-fails at 3 consecutive failures', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.markFailed(trigger.id, 'error 1');
      await scheduler.markFailed(trigger.id, 'error 2');
      await scheduler.markFailed(trigger.id, 'error 3');

      const updated = await scheduler.get(trigger.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.consecutiveFailures).toBe(3);
    });
  });

  describe('markInvoked', () => {
    it('resets consecutive failures and increments count', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.markFailed(trigger.id, 'some error');
      await scheduler.markInvoked(trigger.id);

      const updated = await scheduler.get(trigger.id);
      expect(updated?.consecutiveFailures).toBe(0);
      expect(updated?.invocationCount).toBe(1);
      expect(updated?.lastInvokedAt).toBeDefined();
    });
  });

  describe('recordInvocation', () => {
    it('creates a prompt junction record', async () => {
      const trigger = await createOnceTrigger();
      await scheduler.recordInvocation(trigger.id, 'prompt-123');
    });
  });

  describe('load', () => {
    it('populates cache from database', async () => {
      const created = await createOnceTrigger();

      const freshScheduler = new TriggerScheduler(services);
      expect(await freshScheduler.get(created.id)).toBeUndefined();

      await freshScheduler.load();
      const loaded = await freshScheduler.get(created.id);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(created.id);
      expect(loaded?.name).toBe('Test Once');
    });

    it('get returns data without load when created via create()', async () => {
      const created = await createOnceTrigger();
      const fetched = await scheduler.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });
  });

  describe('invoke', () => {
    it('uses trigger model when no model argument provided', async () => {
      const { spy, fakePrompt } = mockPromptService();
      const trigger = await createOnceTrigger({ model: 'normal' });

      const prompt = await scheduler.invoke(trigger.id);

      expect(prompt.id).toBe(fakePrompt.id);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4' }));
    });

    it('uses explicit model over trigger model', async () => {
      const { spy } = mockPromptService();
      const trigger = await createOnceTrigger({ model: 'normal' });

      await scheduler.invoke(trigger.id, 'normal');

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-3.5' }));
    });

    it('marks invoked on success', async () => {
      mockPromptService();
      const trigger = await createOnceTrigger();

      await scheduler.invoke(trigger.id);

      const updated = await scheduler.get(trigger.id);
      expect(updated?.invocationCount).toBe(1);
      expect(updated?.consecutiveFailures).toBe(0);
    });

    it('marks failed on error', async () => {
      const promptService = services.get(PromptService);
      vi.spyOn(promptService, 'create').mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('model error')),
      } as never);

      const trigger = await createOnceTrigger();

      await expect(scheduler.invoke(trigger.id)).rejects.toThrow('model error');

      const updated = await scheduler.get(trigger.id);
      expect(updated?.consecutiveFailures).toBe(1);
      expect(updated?.lastError).toBe('model error');
    });
  });

  describe('scheduling', () => {
    it('start() schedules active triggers', async () => {
      const trigger = await createCronTrigger({ expression: '* * * * *' });

      const refreshed = await scheduler.get(trigger.id);
      expect(refreshed?.nextInvocationAt).toBeDefined();
    });

    it('create() sets nextInvocationAt for cron triggers', async () => {
      const trigger = await createCronTrigger({ expression: '0 9 * * *' });

      const fetched = await scheduler.get(trigger.id);
      expect(fetched?.nextInvocationAt).toBeDefined();
    });

    it('create() sets nextInvocationAt for future once triggers', async () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      const trigger = await createOnceTrigger({ at: futureDate });

      const fetched = await scheduler.get(trigger.id);
      expect(fetched?.nextInvocationAt).toBeDefined();
    });

    it('stop() prevents triggers from firing', async () => {
      mockPromptService();

      const futureDate = new Date(Date.now() + 500).toISOString();
      await createOnceTrigger({ at: futureDate });

      scheduler.stop();

      await new Promise((r) => setTimeout(r, 700));

      const promptService = services.get(PromptService);
      expect(promptService.create).not.toHaveBeenCalled();
    });

    it('once trigger fires and auto-completes', async () => {
      mockPromptService();

      const futureDate = new Date(Date.now() + 200).toISOString();
      const trigger = await createOnceTrigger({ at: futureDate });

      await new Promise((r) => setTimeout(r, 1000));

      const updated = await scheduler.get(trigger.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.invocationCount).toBe(1);
    });

    it('past once trigger fires immediately', async () => {
      mockPromptService();

      const pastDate = new Date(Date.now() - 60_000).toISOString();
      const trigger = await createOnceTrigger({ at: pastDate });

      await new Promise((r) => setTimeout(r, 500));

      const updated = await scheduler.get(trigger.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.invocationCount).toBe(1);
    });

    it('maxInvocations terminates cron trigger', async () => {
      mockPromptService();

      const trigger = await createCronTrigger({
        expression: '* * * * * *',
        maxInvocations: 1,
      });

      await new Promise((r) => setTimeout(r, 2000));

      const updated = await scheduler.get(trigger.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.invocationCount).toBeGreaterThanOrEqual(1);
    });

    it('failed trigger clears its job after 3 failures', async () => {
      const promptService = services.get(PromptService);
      vi.spyOn(promptService, 'create').mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('always fails')),
      } as never);

      const trigger = await createCronTrigger({ expression: '* * * * * *' });

      await new Promise((r) => setTimeout(r, 4000));

      const updated = await scheduler.get(trigger.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.consecutiveFailures).toBe(3);
    }, 10_000);

    it('update schedule reschedules the job', async () => {
      const trigger = await createCronTrigger({ expression: '0 0 1 1 *' });

      const beforeUpdate = await scheduler.get(trigger.id);
      const oldNext = beforeUpdate?.nextInvocationAt;

      await scheduler.update(trigger.id, {
        scheduleType: 'cron',
        scheduleValue: '* * * * *',
      });

      const afterUpdate = await scheduler.get(trigger.id);
      expect(afterUpdate?.nextInvocationAt).toBeDefined();
      expect(afterUpdate?.nextInvocationAt).not.toBe(oldNext);
    });

    it('pausing a trigger clears its job', async () => {
      mockPromptService();

      const trigger = await createCronTrigger({ expression: '* * * * * *' });

      await scheduler.update(trigger.id, { status: 'paused' });

      await new Promise((r) => setTimeout(r, 1500));

      const promptService = services.get(PromptService);
      expect(promptService.create).not.toHaveBeenCalled();
    });
  });
});
