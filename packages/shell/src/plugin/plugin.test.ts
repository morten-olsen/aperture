import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { SkillService } from '@morten-olsen/agentic-skill';

import { ShellService } from '../service/service.js';

import { shellPlugin } from './plugin.js';

describe('shellPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  describe('setup', () => {
    it('runs migrations without error', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(shellPlugin, {});
    });

    it('configures the service with provided options', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(shellPlugin, { timeout: 10_000, shell: '/bin/bash' });

      const shellService = services.get(ShellService);
      expect(shellService).toBeDefined();
    });

    it('registers a shell skill', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(shellPlugin, {});

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
