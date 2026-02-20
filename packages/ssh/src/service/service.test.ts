import { describe, it, expect, beforeEach } from 'vitest';
import { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';

import { SshService } from './service.js';

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('SshService', () => {
  let services: Services;
  let service: SshService;

  beforeEach(async () => {
    services = Services.mock();
    const dbService = services.get(DatabaseService);
    await dbService.get(database);
    service = services.get(SshService);
  });

  describe('key pair management', () => {
    it('generates a key pair on first call', async () => {
      const keyPair = await service.getOrCreateKeyPair(USER_A);
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(keyPair.publicKey).toMatch(/^ssh-ed25519 /);
    });

    it('returns the same key pair on subsequent calls', async () => {
      const first = await service.getOrCreateKeyPair(USER_A);
      const second = await service.getOrCreateKeyPair(USER_A);
      expect(first.privateKey).toBe(second.privateKey);
      expect(first.publicKey).toBe(second.publicKey);
    });

    it('generates different key pairs per user', async () => {
      const keyA = await service.getOrCreateKeyPair(USER_A);
      const keyB = await service.getOrCreateKeyPair(USER_B);
      expect(keyA.publicKey).not.toBe(keyB.publicKey);
    });
  });

  describe('host management', () => {
    it('starts with an empty host list', async () => {
      const hosts = await service.listHosts(USER_A);
      expect(hosts).toEqual([]);
    });

    it('adds a host and reports it was added', async () => {
      const added = await service.addHost(USER_A, {
        id: 'prod-1',
        hostname: '10.0.0.1',
        port: 22,
        username: 'deploy',
      });
      expect(added).toBe(true);

      const hosts = await service.listHosts(USER_A);
      expect(hosts).toEqual([{ id: 'prod-1', hostname: '10.0.0.1', port: 22, username: 'deploy' }]);
    });

    it('defaults port to 22', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'example.com', username: 'root' });
      const hosts = await service.listHosts(USER_A);
      expect(hosts[0].port).toBe(22);
    });

    it('returns false when adding a duplicate host', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'example.com', username: 'root' });
      const added = await service.addHost(USER_A, { id: 'web', hostname: 'other.com', username: 'root' });
      expect(added).toBe(false);
    });

    it('removes a host and reports it was removed', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'example.com', username: 'root' });
      const removed = await service.removeHost(USER_A, 'web');
      expect(removed).toBe(true);
      expect(await service.listHosts(USER_A)).toEqual([]);
    });

    it('returns false when removing a non-existent host', async () => {
      const removed = await service.removeHost(USER_A, 'nope');
      expect(removed).toBe(false);
    });

    it('gets a host by id', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'example.com', port: 2222, username: 'deploy' });
      const host = await service.getHost(USER_A, 'web');
      expect(host).toEqual({ id: 'web', hostname: 'example.com', port: 2222, username: 'deploy' });
    });

    it('returns undefined for non-existent host', async () => {
      const host = await service.getHost(USER_A, 'nope');
      expect(host).toBeUndefined();
    });

    it('isolates hosts between users', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'a.com', username: 'a' });
      await service.addHost(USER_B, { id: 'web', hostname: 'b.com', username: 'b' });

      const hostsA = await service.listHosts(USER_A);
      const hostsB = await service.listHosts(USER_B);
      expect(hostsA[0].hostname).toBe('a.com');
      expect(hostsB[0].hostname).toBe('b.com');
    });

    it('lists hosts in alphabetical order', async () => {
      await service.addHost(USER_A, { id: 'zebra', hostname: 'z.com', username: 'z' });
      await service.addHost(USER_A, { id: 'alpha', hostname: 'a.com', username: 'a' });
      const hosts = await service.listHosts(USER_A);
      expect(hosts.map((h) => h.id)).toEqual(['alpha', 'zebra']);
    });
  });

  describe('rule management', () => {
    it('starts with an empty rule list', async () => {
      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([]);
    });

    it('adds a rule and reports it was added', async () => {
      const added = await service.addRule(USER_A, 'ls *', '*', 'allow');
      expect(added).toBe(true);
      const rules = await service.listRules(USER_A);
      expect(rules).toEqual([{ pattern: 'ls *', host: '*', type: 'allow' }]);
    });

    it('returns false when adding a duplicate rule', async () => {
      await service.addRule(USER_A, 'ls *', '*', 'allow');
      const added = await service.addRule(USER_A, 'ls *', '*', 'allow');
      expect(added).toBe(false);
    });

    it('removes a rule and reports it was removed', async () => {
      await service.addRule(USER_A, 'ls *', '*', 'allow');
      const removed = await service.removeRule(USER_A, 'ls *', '*');
      expect(removed).toBe(true);
      expect(await service.listRules(USER_A)).toEqual([]);
    });

    it('returns false when removing a non-existent rule', async () => {
      const removed = await service.removeRule(USER_A, 'nope', '*');
      expect(removed).toBe(false);
    });

    it('isolates rules between users', async () => {
      await service.addRule(USER_A, 'ls *', '*', 'allow');
      await service.addRule(USER_B, 'cat *', '*', 'deny');
      expect(await service.listRules(USER_A)).toEqual([{ pattern: 'ls *', host: '*', type: 'allow' }]);
      expect(await service.listRules(USER_B)).toEqual([{ pattern: 'cat *', host: '*', type: 'deny' }]);
    });
  });

  describe('checkCommand', () => {
    it('returns allowed for matching allow rules', async () => {
      await service.addRule(USER_A, 'ls *', '*', 'allow');
      const check = await service.checkCommand(USER_A, 'prod-1', 'ls -la');
      expect(check).toEqual({ allowed: true });
    });

    it('returns denied for matching deny rules', async () => {
      await service.addRule(USER_A, 'rm *', '*', 'deny');
      const check = await service.checkCommand(USER_A, 'prod-1', 'rm -rf /');
      expect(check).toEqual({ allowed: false, denied: true, pattern: 'rm *', host: '*' });
    });

    it('deny rules take precedence over allow rules', async () => {
      await service.addRule(USER_A, '*', '*', 'allow');
      await service.addRule(USER_A, 'rm *', '*', 'deny');
      const check = await service.checkCommand(USER_A, 'prod-1', 'rm -rf /');
      expect(check).toEqual({ allowed: false, denied: true, pattern: 'rm *', host: '*' });
    });

    it('returns not allowed/not denied when no rules match', async () => {
      await service.addRule(USER_A, 'ls *', '*', 'allow');
      const check = await service.checkCommand(USER_A, 'prod-1', 'rm -rf /');
      expect(check).toEqual({ allowed: false, denied: false });
    });

    it('matches host patterns', async () => {
      await service.addRule(USER_A, 'ls *', 'prod-*', 'allow');
      expect(await service.checkCommand(USER_A, 'prod-1', 'ls -la')).toEqual({ allowed: true });
      expect(await service.checkCommand(USER_A, 'staging-1', 'ls -la')).toEqual({ allowed: false, denied: false });
    });

    it('matches both command and host patterns together', async () => {
      await service.addRule(USER_A, 'cat *', 'staging-*', 'allow');
      await service.addRule(USER_A, 'rm *', 'prod-*', 'deny');

      expect(await service.checkCommand(USER_A, 'staging-1', 'cat /etc/hosts')).toEqual({ allowed: true });
      expect(await service.checkCommand(USER_A, 'prod-1', 'cat /etc/hosts')).toEqual({
        allowed: false,
        denied: false,
      });
      expect(await service.checkCommand(USER_A, 'prod-1', 'rm -rf /')).toEqual({
        allowed: false,
        denied: true,
        pattern: 'rm *',
        host: 'prod-*',
      });
    });

    it('does not match rules from another user', async () => {
      await service.addRule(USER_A, 'ls *', '*', 'allow');
      expect(await service.checkCommand(USER_B, 'prod-1', 'ls -la')).toEqual({ allowed: false, denied: false });
    });
  });

  describe('execute', () => {
    it('rejects commands not matching any rule', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'example.com', username: 'root' });
      await expect(service.execute({ userId: USER_A, hostId: 'web', command: 'ls' })).rejects.toThrow(
        'does not match any allowed rule',
      );
    });

    it('rejects commands matching a deny rule', async () => {
      await service.addHost(USER_A, { id: 'web', hostname: 'example.com', username: 'root' });
      await service.addRule(USER_A, 'rm *', '*', 'deny');
      await expect(service.execute({ userId: USER_A, hostId: 'web', command: 'rm -rf /' })).rejects.toThrow(
        'blocked by deny rule',
      );
    });

    it('rejects when host does not exist', async () => {
      await expect(service.execute({ userId: USER_A, hostId: 'missing', command: 'ls', force: true })).rejects.toThrow(
        'Host "missing" not found',
      );
    });
  });
});
