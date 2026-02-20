import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { calendarPluginOptionsSchema } from '../schemas/schemas.js';
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

    await syncService.initialSync().catch((error) => {
      console.warn('[calendar] Initial sync failed, will retry on next interval:', error.message);
    });
    syncService.startPeriodicSync();
  },
  prepare: async ({ config, tools, context, services }) => {
    tools.push(...calendarTools);

    const calendarNames = config.sources.map((s) => s.name).join(', ');
    context.items.push({
      type: 'calendar-context',
      content: `You have access to the user's calendars: ${calendarNames}.\nUse the calendar.* tools to search events and manage notes.`,
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
