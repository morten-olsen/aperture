import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Services, PluginService, State, PluginPrepare } from '@morten-olsen/agentic-core';

import { TriggerScheduler } from '../scheduler/scheduler.js';

import { triggerPlugin } from './plugin.js';

describe('triggerPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  afterEach(() => {
    const scheduler = services.get(TriggerScheduler);
    scheduler.stop();
  });

  const createPrepare = (stateInit: Record<string, unknown> = {}) => {
    const context = { items: [] as { type: string; content: string }[] };
    const tools: { id: string }[] = [];
    const state = State.fromInit(stateInit);

    return new PluginPrepare({
      context,
      prompts: [],
      tools: tools as never[],
      services,
      state,
    });
  };

  describe('setup', () => {
    it('runs migrations without error', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(triggerPlugin);
    });

    it('calls start() on the scheduler', async () => {
      const scheduler = services.get(TriggerScheduler);
      const startSpy = vi.spyOn(scheduler, 'start');

      const pluginService = services.get(PluginService);
      await pluginService.register(triggerPlugin);

      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('prepare (normal session)', () => {
    it('adds standard trigger tools when not in trigger session', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(triggerPlugin);

      const prepare = createPrepare();
      await triggerPlugin.prepare?.(prepare);

      const toolIds = prepare.tools.map((t) => t.id);
      expect(toolIds).toContain('trigger.create');
      expect(toolIds).toContain('trigger.list');
      expect(toolIds).toContain('trigger.update');
      expect(toolIds).toContain('trigger.delete');
      expect(toolIds).toContain('trigger.invoke');
      expect(toolIds).not.toContain('trigger.notify');
    });
  });

  describe('prepare (trigger-invoked session)', () => {
    it('adds trigger context and pre-bound tools', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(triggerPlugin);

      const scheduler = services.get(TriggerScheduler);
      const trigger = await scheduler.create({
        userId: 'admin',
        name: 'Test Trigger',
        goal: 'Check something',
        model: 'normal',
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        setupContext: 'Morning check',
      });

      const prepare = createPrepare({
        trigger: { from: { id: trigger.id, type: 'cron' } },
      });

      await triggerPlugin.prepare?.(prepare);

      const toolIds = prepare.tools.map((t) => t.id);
      expect(toolIds).toContain('trigger.create');
      expect(toolIds).toContain('trigger.list');
      expect(toolIds).toContain('trigger.update');
      expect(toolIds).toContain('trigger.delete');
      expect(toolIds).not.toContain('trigger.invoke');

      const contextContent = prepare.context.items.map((i) => i.content).join('\n');
      expect(contextContent).toContain('Check something');
      expect(contextContent).toContain('Morning check');
      expect(contextContent).toContain('scheduled trigger');
    });

    it('includes continuation in context when present', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(triggerPlugin);

      const scheduler = services.get(TriggerScheduler);
      const trigger = await scheduler.create({
        userId: 'admin',
        name: 'Test',
        goal: 'Monitor',
        model: 'normal',
        scheduleType: 'cron',
        scheduleValue: '0 * * * *',
      });
      await scheduler.update(trigger.id, { continuation: 'Found 3 items last time' });

      const prepare = createPrepare({
        trigger: { from: { id: trigger.id, type: 'cron' } },
      });

      await triggerPlugin.prepare?.(prepare);

      const contextContent = prepare.context.items.map((i) => i.content).join('\n');
      expect(contextContent).toContain('Found 3 items last time');
    });
  });
});
