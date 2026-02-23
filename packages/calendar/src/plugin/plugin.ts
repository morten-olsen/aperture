import { createPlugin } from '@morten-olsen/agentic-core';
import { ConnectionService } from '@morten-olsen/agentic-connection';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { caldavConnectionFieldsSchema, calendarPluginOptionsSchema } from '../schemas/schemas.js';
import type { CaldavConnectionFields } from '../schemas/schemas.js';
import { CalendarSyncService } from '../sync/sync.js';
import { calendarTools } from '../tools/tools.js';
import { database } from '../database/database.js';

const calendarPlugin = createPlugin({
  id: 'calendar',
  config: calendarPluginOptionsSchema,
  state: z.object({}),
  setup: async ({ config, services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);

    const syncService = services.get(CalendarSyncService);
    syncService.initialize(config);

    const connectionService = services.get(ConnectionService);
    connectionService.registerType({
      id: 'caldav',
      name: 'CalDAV Calendar',
      description: 'A CalDAV calendar source (iCloud, Google, Nextcloud, etc.)',
      fields: {
        schema: caldavConnectionFieldsSchema,
        secretFields: ['passwordSecretId'],
      },
    });
  },
  prepare: async ({ config, tools, context, services, userId }) => {
    const connectionService = services.get(ConnectionService);
    const connections = await connectionService.list(userId, 'caldav');

    if (connections.length === 0) return;

    tools.push(...calendarTools);

    const syncService = services.get(CalendarSyncService);
    const syncInterval = config.defaultSyncIntervalMinutes ?? 15;

    for (const connection of connections) {
      const resolved = await connectionService.resolve(userId, connection.id);
      if (!resolved) continue;

      const fields = resolved as unknown as CaldavConnectionFields;
      await syncService.ensureFresh(userId, connection.id, syncInterval, fields).catch((error) => {
        console.warn(`[calendar] Failed to sync connection "${connection.name}":`, (error as Error).message);
      });

      syncService.startPeriodicSyncForConnection(userId, connection.id, fields);
    }

    const connectionNames = connections.map((c) => c.name).join(', ');
    context.items.push({
      type: 'calendar-context',
      content: `You have access to the user's calendars: ${connectionNames}.\nUse the calendar.* tools to search events and manage notes.`,
    });

    if (config.injectTodayAgenda) {
      const db = await services.get(DatabaseService).get(database);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const events = await db
        .selectFrom('calendar_events')
        .select(['summary', 'start_at', 'location'])
        .where('user_id', '=', userId)
        .where('start_at', '>=', today.toISOString())
        .where('start_at', '<', tomorrow.toISOString())
        .orderBy('start_at', 'asc')
        .execute();

      if (events.length > 0) {
        const agendaLines = events.map((e) => {
          const time = new Date(e.start_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          const location = e.location ? ` (${e.location})` : '';
          return `- ${time}: ${e.summary}${location}`;
        });

        context.items.push({
          type: 'calendar-today-agenda',
          content: `Today's agenda:\n${agendaLines.join('\n')}`,
        });
      }
    }
  },
});

export { calendarPlugin };
