import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { SkillService } from '@morten-olsen/agentic-skill';

import { SshService } from '../service/service.js';

import { createSshPlugin } from './plugin.js';

describe('createSshPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  describe('setup', () => {
    it('runs migrations without error', async () => {
      const plugin = createSshPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);
    });

    it('configures the service with provided options', async () => {
      const plugin = createSshPlugin({ timeout: 10_000 });
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const sshService = services.get(SshService);
      expect(sshService).toBeDefined();
    });

    it('registers an ssh skill', async () => {
      const plugin = createSshPlugin();
      const pluginService = services.get(PluginService);
      await pluginService.register(plugin);

      const skillService = services.get(SkillService);
      const skill = skillService.skills.find((s) => s.id === 'ssh');
      expect(skill).toBeDefined();

      const toolIds = skill?.tools?.map((t) => t.id) ?? [];
      expect(skill?.tools).toHaveLength(8);
      expect(toolIds).toContain('ssh.execute');
      expect(toolIds).toContain('ssh.add-host');
      expect(toolIds).toContain('ssh.remove-host');
      expect(toolIds).toContain('ssh.list-hosts');
      expect(toolIds).toContain('ssh.add-rule');
      expect(toolIds).toContain('ssh.remove-rule');
      expect(toolIds).toContain('ssh.list-rules');
      expect(toolIds).toContain('ssh.show-public-key');
    });
  });
});
