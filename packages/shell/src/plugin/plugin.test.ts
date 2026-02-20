import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService, State, PluginPrepare } from '@morten-olsen/agentic-core';

import { ShellService } from '../service/service.js';

import { createShellPlugin } from './plugin.js';

describe('createShellPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  const createPrepare = () => {
    const context = { items: [] as { type: string; content: string }[] };
    const tools: { id: string }[] = [];
    const state = State.fromInit({});

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
      const plugin = createShellPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);
    });

    it('configures the service with provided options', async () => {
      const plugin = createShellPlugin({ timeout: 10_000, shell: '/bin/bash' });
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const shellService = services.get(ShellService);
      expect(shellService).toBeDefined();
    });
  });

  describe('prepare', () => {
    it('adds all shell tools', async () => {
      const plugin = createShellPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const prepare = createPrepare();
      await plugin.prepare?.(prepare);

      const toolIds = prepare.tools.map((t) => t.id);
      expect(toolIds).toContain('shell.execute');
      expect(toolIds).toContain('shell.add-rule');
      expect(toolIds).toContain('shell.remove-rule');
      expect(toolIds).toContain('shell.list-rules');
    });
  });
});
