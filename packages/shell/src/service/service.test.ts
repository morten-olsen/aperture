import { describe, it, expect, beforeEach } from 'vitest';
import { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';

import { ShellService } from './service.js';

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('ShellService', () => {
  let services: Services;
  let service: ShellService;

  beforeEach(async () => {
    services = Services.mock();
    const dbService = services.get(DatabaseService);
    await dbService.get(database);
    service = services.get(ShellService);
  });

  describe('rule management', () => {
    it('starts with an empty rule list', async () => {
      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([]);
    });

    it('adds an allow rule and reports it was added', async () => {
      const added = await service.addRule(USER_A, 'git *', 'allow');
      expect(added).toBe(true);

      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([{ pattern: 'git *', type: 'allow' }]);
    });

    it('adds a deny rule and reports it was added', async () => {
      const added = await service.addRule(USER_A, 'rm *', 'deny');
      expect(added).toBe(true);

      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([{ pattern: 'rm *', type: 'deny' }]);
    });

    it('returns false when adding a duplicate rule', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      const added = await service.addRule(USER_A, 'git *', 'allow');
      expect(added).toBe(false);
    });

    it('removes a rule and reports it was removed', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      const removed = await service.removeRule(USER_A, 'git *');
      expect(removed).toBe(true);

      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([]);
    });

    it('returns false when removing a non-existent rule', async () => {
      const removed = await service.removeRule(USER_A, 'nope');
      expect(removed).toBe(false);
    });

    it('lists rules in alphabetical order', async () => {
      await service.addRule(USER_A, 'npm run *', 'allow');
      await service.addRule(USER_A, 'git *', 'allow');
      await service.addRule(USER_A, 'ls', 'allow');

      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([
        { pattern: 'git *', type: 'allow' },
        { pattern: 'ls', type: 'allow' },
        { pattern: 'npm run *', type: 'allow' },
      ]);
    });

    it('isolates rules between users', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      await service.addRule(USER_B, 'npm *', 'allow');

      expect(await service.listRules(USER_A)).toEqual([{ pattern: 'git *', type: 'allow' }]);
      expect(await service.listRules(USER_B)).toEqual([{ pattern: 'npm *', type: 'allow' }]);
    });

    it('allows the same pattern for different users', async () => {
      const addedA = await service.addRule(USER_A, 'git *', 'allow');
      const addedB = await service.addRule(USER_B, 'git *', 'allow');
      expect(addedA).toBe(true);
      expect(addedB).toBe(true);
    });
  });

  describe('checkCommand', () => {
    it('returns allowed for matching allow rules', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      const check = await service.checkCommand(USER_A, 'git status');
      expect(check).toEqual({ allowed: true });
    });

    it('returns denied for matching deny rules', async () => {
      await service.addRule(USER_A, 'rm *', 'deny');
      const check = await service.checkCommand(USER_A, 'rm -rf /');
      expect(check).toEqual({ allowed: false, denied: true, pattern: 'rm *' });
    });

    it('deny rules take precedence over allow rules', async () => {
      await service.addRule(USER_A, '*', 'allow');
      await service.addRule(USER_A, 'rm *', 'deny');
      const check = await service.checkCommand(USER_A, 'rm -rf /');
      expect(check).toEqual({ allowed: false, denied: true, pattern: 'rm *' });
    });

    it('returns not allowed/not denied when no rules match', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      const check = await service.checkCommand(USER_A, 'npm install');
      expect(check).toEqual({ allowed: false, denied: false });
    });

    it('does not match rules from another user', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      const check = await service.checkCommand(USER_B, 'git status');
      expect(check).toEqual({ allowed: false, denied: false });
    });

    it('matches exact commands', async () => {
      await service.addRule(USER_A, 'ls', 'allow');
      expect(await service.checkCommand(USER_A, 'ls')).toEqual({ allowed: true });
      expect(await service.checkCommand(USER_A, 'ls -la')).toEqual({ allowed: false, denied: false });
    });

    it('matches wildcard patterns', async () => {
      await service.addRule(USER_A, 'git *', 'allow');
      expect(await service.checkCommand(USER_A, 'git status')).toEqual({ allowed: true });
      expect(await service.checkCommand(USER_A, 'git log --oneline')).toEqual({ allowed: true });
      expect(await service.checkCommand(USER_A, 'git')).toEqual({ allowed: false, denied: false });
    });

    it('escapes regex special characters in patterns', async () => {
      await service.addRule(USER_A, 'echo hello.world', 'allow');
      expect(await service.checkCommand(USER_A, 'echo hello.world')).toEqual({ allowed: true });
      expect(await service.checkCommand(USER_A, 'echo helloXworld')).toEqual({ allowed: false, denied: false });
    });
  });

  describe('execute', () => {
    it('rejects commands not matching any rule', async () => {
      await expect(service.execute({ userId: USER_A, command: 'echo hello' })).rejects.toThrow(
        'Command "echo hello" does not match any allowed pattern',
      );
    });

    it('rejects commands matching a deny rule', async () => {
      await service.addRule(USER_A, 'rm *', 'deny');
      await expect(service.execute({ userId: USER_A, command: 'rm -rf /' })).rejects.toThrow(
        'Command "rm -rf /" is blocked by deny rule "rm *"',
      );
    });

    it('executes an allowed command and returns output', async () => {
      await service.addRule(USER_A, 'echo *', 'allow');
      const result = await service.execute({ userId: USER_A, command: 'echo hello' });

      expect(result.command).toBe('echo hello');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello');
      expect(result.stderr).toBe('');
      expect(result.truncated).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('captures stderr and non-zero exit codes', async () => {
      await service.addRule(USER_A, 'sh *', 'allow');
      const result = await service.execute({ userId: USER_A, command: 'sh -c "echo err >&2; exit 1"' });

      expect(result.exitCode).toBe(1);
      expect(result.stderr.trim()).toBe('err');
    });

    it('executes with force flag bypassing rules', async () => {
      const result = await service.execute({ userId: USER_A, command: 'echo forced', force: true });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('forced');
    });

    it('rejects commands allowed for a different user', async () => {
      await service.addRule(USER_A, 'echo *', 'allow');
      await expect(service.execute({ userId: USER_B, command: 'echo hello' })).rejects.toThrow(
        'does not match any allowed pattern',
      );
    });

    it('truncates output exceeding maxOutputLength', async () => {
      service.configure({ maxOutputLength: 20 });
      await service.addRule(USER_A, 'echo *', 'allow');

      const result = await service.execute({
        userId: USER_A,
        command: 'echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });

      expect(result.truncated).toBe(true);
      expect(result.stdout.length + result.stderr.length).toBeLessThanOrEqual(20);
    });
  });
});
