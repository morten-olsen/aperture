import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Services, PluginService, State, PluginPrepare } from '@morten-olsen/agentic-core';
import type { Prompt } from '@morten-olsen/agentic-core';
import { EmbeddingService } from '@morten-olsen/agentic-database';

import { BlueprintService } from '../service/service.js';

import { createBlueprintPlugin } from './plugin.js';

describe('createBlueprintPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
    services.set(EmbeddingService, {
      dimensions: 3,
      embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
    });
  });

  const createPrepare = (options: { stateInit?: Record<string, unknown>; prompts?: Prompt[] } = {}) => {
    const context = { items: [] as { type: string; content: string }[] };
    const tools: { id: string }[] = [];
    const state = State.fromInit(options.stateInit ?? {});

    return new PluginPrepare({
      userId: 'admin',
      context,
      prompts: options.prompts ?? [],
      tools: tools as never[],
      services,
      state,
    });
  };

  describe('setup', () => {
    it('runs migrations without error', async () => {
      const plugin = createBlueprintPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);
    });

    it('configures the service with provided options', async () => {
      const plugin = createBlueprintPlugin({ topN: 3, maxDistance: 0.5 });
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const service = services.get(BlueprintService);
      expect(service).toBeDefined();
    });
  });

  describe('prepare', () => {
    it('adds all blueprint tools', async () => {
      const plugin = createBlueprintPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const prepare = createPrepare();
      await plugin.prepare?.(prepare);

      const toolIds = prepare.tools.map((t) => t.id);
      expect(toolIds).toContain('blueprint.get');
      expect(toolIds).toContain('blueprint.create');
      expect(toolIds).toContain('blueprint.update');
      expect(toolIds).toContain('blueprint.delete');
      expect(toolIds).toContain('blueprint.list');
    });

    it('injects fallback context when no prompts have input', async () => {
      const plugin = createBlueprintPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const prepare = createPrepare();
      await plugin.prepare?.(prepare);

      const content = prepare.context.items.map((i) => i.content).join('\n');
      expect(content).toContain('blueprint.create');
      expect(content).toContain('recurring tasks');
    });

    it('runs search and injects matching blueprints into context', async () => {
      const plugin = createBlueprintPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const service = services.get(BlueprintService);
      await service.create({
        title: 'Deploy to prod',
        use_case: 'When deploying',
        process: 'Steps here',
      });

      const prompts: Prompt[] = [
        {
          id: 'prompt-1',
          userId: 'admin',
          model: 'normal',
          visible: true,
          state: 'running',
          input: 'Deploy to production',
          output: [],
        },
      ];

      services.set(EmbeddingService, {
        dimensions: 3,
        embed: async () => [[0.1, 0.2, 0.3]],
      });

      const prepare = createPrepare({ prompts });
      await plugin.prepare?.(prepare);

      const content = prepare.context.items.map((i) => i.content).join('\n');
      expect(content).toContain('Deploy to prod');
      expect(content).toContain('blueprint.get');
    });

    it('injects fallback context when search returns no matches', async () => {
      const plugin = createBlueprintPlugin({ maxDistance: 0.001 });
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const prompts: Prompt[] = [
        {
          id: 'prompt-1',
          userId: 'admin',
          model: 'normal',
          visible: true,
          state: 'running',
          input: 'Something unrelated',
          output: [],
        },
      ];

      const prepare = createPrepare({ prompts });
      await plugin.prepare?.(prepare);

      const content = prepare.context.items.map((i) => i.content).join('\n');
      expect(content).toContain('recurring tasks');
      expect(content).not.toContain('These may be relevant');
    });

    it('uses cached results when prompt ID matches', async () => {
      const plugin = createBlueprintPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const service = services.get(BlueprintService);
      const searchSpy = vi.spyOn(service, 'search');

      const prompts: Prompt[] = [
        {
          id: 'prompt-cached',
          userId: 'admin',
          model: 'normal',
          visible: true,
          state: 'running',
          input: 'Deploy',
          output: [],
        },
      ];

      const prepare1 = createPrepare({ prompts });
      await plugin.prepare?.(prepare1);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      const stateRecord = prepare1.state.toRecord();
      const prepare2 = createPrepare({ prompts, stateInit: stateRecord });
      await plugin.prepare?.(prepare2);
      expect(searchSpy).toHaveBeenCalledTimes(1);
    });

    it('re-searches when prompt ID changes', async () => {
      const plugin = createBlueprintPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const service = services.get(BlueprintService);
      const searchSpy = vi.spyOn(service, 'search');

      const prompts1: Prompt[] = [
        {
          id: 'prompt-1',
          userId: 'admin',
          model: 'normal',
          visible: true,
          state: 'running',
          input: 'First query',
          output: [],
        },
      ];

      const prepare1 = createPrepare({ prompts: prompts1 });
      await plugin.prepare?.(prepare1);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      const prompts2: Prompt[] = [
        ...prompts1,
        {
          id: 'prompt-2',
          userId: 'admin',
          model: 'normal',
          visible: true,
          state: 'running',
          input: 'Second query',
          output: [],
        },
      ];

      const stateRecord = prepare1.state.toRecord();
      const prepare2 = createPrepare({ prompts: prompts2, stateInit: stateRecord });
      await plugin.prepare?.(prepare2);
      expect(searchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
