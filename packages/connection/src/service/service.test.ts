import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { connectionsDatabase } from '../database/database.js';
import { connectionPlugin } from '../plugin/plugin.js';

import { ConnectionService } from './service.js';

const caldavSchema = z.object({
  url: z.string(),
  username: z.string(),
  passwordSecretId: z.string(),
});

const registerCaldavType = (connectionService: ConnectionService) => {
  connectionService.registerType({
    id: 'caldav',
    name: 'CalDAV Calendar',
    description: 'A CalDAV calendar source',
    fields: {
      schema: caldavSchema,
      secretFields: ['passwordSecretId'],
    },
  });
};

const createSecret = async (services: Services, userId: string, name: string, value: string) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await services.secrets.set(userId, { id, userId, name, createdAt: now, updatedAt: now }, value);
  return id;
};

describe('ConnectionService', () => {
  let services: Services;
  let connectionService: ConnectionService;
  const userId = 'test-user';

  beforeEach(async () => {
    services = Services.mock();

    const databaseService = services.get(DatabaseService);
    await databaseService.get(connectionsDatabase);

    connectionService = services.get(ConnectionService);
    registerCaldavType(connectionService);
  });

  describe('resolve', () => {
    it('replaces secret UUID with actual secret value', async () => {
      const secretValue = 'my-super-secret-password';
      const secretId = await createSecret(services, userId, 'Test Password', secretValue);

      const connection = await connectionService.create(userId, {
        type: 'caldav',
        name: 'Test Calendar',
        fields: {
          url: 'https://caldav.example.com',
          username: 'user@example.com',
          passwordSecretId: secretId,
        },
      });

      const resolved = await connectionService.resolve(userId, connection.id);

      expect(resolved).toBeDefined();
      expect(resolved?.['passwordSecretId']).toBe(secretValue);
      expect(resolved?.['passwordSecretId']).not.toBe(secretId);
    });

    it('leaves non-secret fields unchanged', async () => {
      const secretId = await createSecret(services, userId, 'Test', 'password123');

      const connection = await connectionService.create(userId, {
        type: 'caldav',
        name: 'Test',
        fields: {
          url: 'https://caldav.example.com',
          username: 'admin',
          passwordSecretId: secretId,
        },
      });

      const resolved = await connectionService.resolve(userId, connection.id);
      expect(resolved?.['url']).toBe('https://caldav.example.com');
      expect(resolved?.['username']).toBe('admin');
    });

    it('returns undefined for non-existent connection', async () => {
      const resolved = await connectionService.resolve(userId, 'non-existent');
      expect(resolved).toBeUndefined();
    });

    it('keeps secret field as-is when secret is not found', async () => {
      const fakeSecretId = crypto.randomUUID();

      const connection = await connectionService.create(userId, {
        type: 'caldav',
        name: 'Test',
        fields: {
          url: 'https://caldav.example.com',
          username: 'admin',
          passwordSecretId: fakeSecretId,
        },
      });

      const resolved = await connectionService.resolve(userId, connection.id);
      expect(resolved?.['passwordSecretId']).toBe(fakeSecretId);
    });
  });

  describe('secret name resolution on create', () => {
    it('resolves secret names to UUIDs when creating', async () => {
      const secretId = await createSecret(services, userId, 'My App Password', 'the-password');

      const connection = await connectionService.create(userId, {
        type: 'caldav',
        name: 'Test Calendar',
        fields: {
          url: 'https://caldav.example.com',
          username: 'user',
          passwordSecretId: 'My App Password',
        },
      });

      // Stored field should be the UUID, not the name
      expect(connection.fields['passwordSecretId']).toBe(secretId);

      // Resolve should give us the actual password
      const resolved = await connectionService.resolve(userId, connection.id);
      expect(resolved?.['passwordSecretId']).toBe('the-password');
    });

    it('throws when secret name is not found', async () => {
      await expect(
        connectionService.create(userId, {
          type: 'caldav',
          name: 'Test',
          fields: {
            url: 'https://caldav.example.com',
            username: 'user',
            passwordSecretId: 'NonExistent Secret',
          },
        }),
      ).rejects.toThrow('Secret not found by name');
    });

    it('skips name resolution for values that are already UUIDs', async () => {
      const secretId = await createSecret(services, userId, 'Test', 'password');

      const connection = await connectionService.create(userId, {
        type: 'caldav',
        name: 'Test',
        fields: {
          url: 'https://example.com',
          username: 'user',
          passwordSecretId: secretId,
        },
      });

      // UUID should be stored as-is
      expect(connection.fields['passwordSecretId']).toBe(secretId);
    });
  });
});

describe('ConnectionService edge cases', () => {
  let services: Services;
  let connectionService: ConnectionService;
  const userId = 'test-user';

  beforeEach(async () => {
    services = Services.mock();
    const databaseService = services.get(DatabaseService);
    await databaseService.get(connectionsDatabase);
    connectionService = services.get(ConnectionService);
    registerCaldavType(connectionService);
  });

  it('resolves to empty string when secret value was stored as empty', async () => {
    const secretId = await createSecret(services, userId, 'Empty Secret', '');

    const connection = await connectionService.create(userId, {
      type: 'caldav',
      name: 'Test',
      fields: {
        url: 'https://caldav.example.com',
        username: 'user',
        passwordSecretId: secretId,
      },
    });

    const resolved = await connectionService.resolve(userId, connection.id);

    // An empty string is still a defined value, so the UUID gets replaced
    expect(resolved?.['passwordSecretId']).toBe('');
  });

  it('resolves to empty string through database provider when stored empty', async () => {
    // Use the full connection plugin to test with SecretsProviderDatabase
    const freshServices = Services.mock();
    const pluginService = freshServices.get(PluginService);
    await pluginService.register(connectionPlugin, undefined);

    const freshConnectionService = freshServices.get(ConnectionService);
    registerCaldavType(freshConnectionService);

    const secretId = await createSecret(freshServices, userId, 'Empty DB Secret', '');

    const retrieved = await freshServices.secrets.get(userId, secretId);
    expect(retrieved).toBe('');

    const connection = await freshConnectionService.create(userId, {
      type: 'caldav',
      name: 'Test',
      fields: {
        url: 'https://caldav.example.com',
        username: 'user',
        passwordSecretId: secretId,
      },
    });

    const resolved = await freshConnectionService.resolve(userId, connection.id);
    expect(resolved?.['passwordSecretId']).toBe('');
  });
});

describe('ConnectionService with SecretsProviderDatabase (production path)', () => {
  let services: Services;
  let connectionService: ConnectionService;
  const userId = 'test-user';

  beforeEach(async () => {
    services = Services.mock();

    // Register the full connection plugin — this sets up both databases
    // and swaps secrets to SecretsProviderDatabase
    const pluginService = services.get(PluginService);
    await pluginService.register(connectionPlugin, undefined);

    connectionService = services.get(ConnectionService);
    registerCaldavType(connectionService);
  });

  it('resolves secrets through the database provider', async () => {
    const secretId = await createSecret(services, userId, 'Apple App Password', 'icloud-app-password-xxxx');

    // Verify secret can be retrieved
    const retrieved = await services.secrets.get(userId, secretId);
    expect(retrieved).toBe('icloud-app-password-xxxx');

    // Create connection with the secret UUID
    const connection = await connectionService.create(userId, {
      type: 'caldav',
      name: 'iCloud Calendar',
      fields: {
        url: 'https://caldav.icloud.com',
        username: 'user@icloud.com',
        passwordSecretId: secretId,
      },
    });

    // Resolve should replace UUID with actual password
    const resolved = await connectionService.resolve(userId, connection.id);

    expect(resolved).toBeDefined();
    expect(resolved?.['url']).toBe('https://caldav.icloud.com');
    expect(resolved?.['username']).toBe('user@icloud.com');
    expect(resolved?.['passwordSecretId']).toBe('icloud-app-password-xxxx');
    expect(resolved?.['passwordSecretId']).not.toBe(secretId);
  });

  it('resolves secret names to UUIDs through database provider', async () => {
    const secretId = await createSecret(services, userId, 'Google App Password', 'google-password-1234');

    // Create connection using secret name
    const connection = await connectionService.create(userId, {
      type: 'caldav',
      name: 'Google Calendar',
      fields: {
        url: 'https://www.googleapis.com/caldav/v2',
        username: 'user@gmail.com',
        passwordSecretId: 'Google App Password',
      },
    });

    // Should have stored the UUID
    expect(connection.fields['passwordSecretId']).toBe(secretId);

    // Resolve should give us the actual password
    const resolved = await connectionService.resolve(userId, connection.id);
    expect(resolved?.['passwordSecretId']).toBe('google-password-1234');
  });
});
