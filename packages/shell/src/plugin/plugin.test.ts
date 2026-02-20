import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { SkillService } from '@morten-olsen/agentic-skill';

import { ShellService } from '../service/service.js';

import { createShellPlugin } from './plugin.js';

describe('createShellPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

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

    it('registers a shell skill', async () => {
      const plugin = createShellPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const skillService = services.get(SkillService);
      const skill = skillService.skills.find((s) => s.id === 'shell');
      expect(skill).toBeDefined();

      const toolIds = skill?.tools?.map((t) => t.id) ?? [];
      expect(skill?.tools).toHaveLength(4);
      expect(toolIds).toContain('shell.execute');
      expect(toolIds).toContain('shell.add-rule');
      expect(toolIds).toContain('shell.remove-rule');
      expect(toolIds).toContain('shell.list-rules');
    });
  });
});
