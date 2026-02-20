import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { SkillService } from '@morten-olsen/agentic-skill';

import { SshService } from '../service/service.js';

import { sshPlugin } from './plugin.js';

describe('sshPlugin', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  describe('setup', () => {
    it('runs migrations without error', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(sshPlugin, {});
    });

    it('configures the service with provided options', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(sshPlugin, { timeout: 10_000 });

      const sshService = services.get(SshService);
      expect(sshService).toBeDefined();
    });

    it('registers an ssh skill', async () => {
      const pluginService = services.get(PluginService);
      await pluginService.register(sshPlugin, {});

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
