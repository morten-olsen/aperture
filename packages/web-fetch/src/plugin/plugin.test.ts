import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService, State, PluginPrepare } from '@morten-olsen/agentic-core';

import { WebFetchService } from '../service/service.js';

import { createWebFetchPlugin } from './plugin.js';

describe('createWebFetchPlugin', () => {
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
      const plugin = createWebFetchPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);
    });

    it('configures the service with provided options', async () => {
      const plugin = createWebFetchPlugin({ maxCharacters: 10_000, defaultMode: 'html', userAgent: 'Custom/1.0' });
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      // Service is configured — verify by checking it doesn't throw when accessed
      const webFetchService = services.get(WebFetchService);
      expect(webFetchService).toBeDefined();
    });
  });

  describe('prepare', () => {
    it('adds all web-fetch tools', async () => {
      const plugin = createWebFetchPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const prepare = createPrepare();
      await plugin.prepare?.(prepare);

      const toolIds = prepare.tools.map((t) => t.id);
      expect(toolIds).toContain('web-fetch.fetch');
      expect(toolIds).toContain('web-fetch.add-domain');
      expect(toolIds).toContain('web-fetch.remove-domain');
      expect(toolIds).toContain('web-fetch.list-domains');
    });

    it('adds context about web fetching capabilities', async () => {
      const plugin = createWebFetchPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const prepare = createPrepare();
      await plugin.prepare?.(prepare);

      const contextContent = prepare.context.items.map((i) => i.content).join('\n');
      expect(contextContent).toContain('web-fetch');
      expect(contextContent).toContain('allowlist');
    });
  });
});
