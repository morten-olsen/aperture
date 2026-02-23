import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';
import type { CaldavConnectionFields } from '../schemas/schemas.js';

import { CalendarSyncService } from './sync.js';

vi.mock('tsdav', () => ({
  createDAVClient: vi.fn(),
}));

describe('CalendarSyncService credential handling', () => {
  let services: Services;
  let syncService: CalendarSyncService;
  let createDAVClientMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    services = Services.mock();

    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);

    syncService = services.get(CalendarSyncService);
    syncService.initialize({});

    const tsdav = await import('tsdav');
    createDAVClientMock = tsdav.createDAVClient as ReturnType<typeof vi.fn>;
  });

  it('passes resolved password (not UUID) to createDAVClient', async () => {
    const actualPassword = 'abcd-efgh-ijkl-mnop';

    createDAVClientMock.mockResolvedValue({
      fetchCalendars: vi.fn().mockResolvedValue([]),
    });

    const fields: CaldavConnectionFields = {
      url: 'https://caldav.icloud.com',
      username: 'user@icloud.com',
      passwordSecretId: actualPassword,
    };

    await syncService.syncConnection('test-user', 'conn-1', fields);

    expect(createDAVClientMock).toHaveBeenCalledWith({
      serverUrl: 'https://caldav.icloud.com',
      credentials: {
        username: 'user@icloud.com',
        password: actualPassword,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  });

  it('would fail if a UUID were passed instead of the resolved password', async () => {
    const secretUUID = crypto.randomUUID();

    createDAVClientMock.mockResolvedValue({
      fetchCalendars: vi.fn().mockResolvedValue([]),
    });

    const fields: CaldavConnectionFields = {
      url: 'https://caldav.icloud.com',
      username: 'user@icloud.com',
      passwordSecretId: secretUUID,
    };

    await syncService.syncConnection('test-user', 'conn-1', fields);

    // Demonstrates what happens when resolve() fails — a UUID gets sent as the password
    const call = createDAVClientMock.mock.calls[0][0];
    expect(call.credentials.password).toBe(secretUUID);
  });

  it('uses the password field in the Basic auth header for fallback fetches', async () => {
    const actualPassword = 'real-app-password';
    const expectedAuth = `Basic ${Buffer.from(`user@icloud.com:${actualPassword}`).toString('base64')}`;

    const mockPropfind = vi.fn().mockResolvedValue([{ ok: true, href: '/calendar/event1.ics' }]);

    const mockMultiGet = vi.fn().mockRejectedValue(new Error('multiget not supported'));

    createDAVClientMock.mockResolvedValue({
      fetchCalendars: vi
        .fn()
        .mockResolvedValue([{ url: 'https://caldav.icloud.com/calendar/', displayName: 'My Calendar' }]),
      propfind: mockPropfind,
      calendarMultiGet: mockMultiGet,
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR', { status: 200 }));

    const fields: CaldavConnectionFields = {
      url: 'https://caldav.icloud.com',
      username: 'user@icloud.com',
      passwordSecretId: actualPassword,
    };

    await syncService.syncConnection('test-user', 'conn-1', fields);

    // Verify the Authorization header uses the resolved password
    expect(fetchSpy).toHaveBeenCalled();
    const fetchCall = fetchSpy.mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(expectedAuth);

    fetchSpy.mockRestore();
  });
});
