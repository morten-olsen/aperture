import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import type { CaldavConnectionFields } from '../schemas/schemas.js';

const sync = createTool({
  id: 'calendar.sync',
  description: 'Trigger a manual sync for a specific calendar connection. Returns sync status and any errors.',
  input: z.object({
    calendarId: z.string().describe('Calendar connection ID to sync'),
  }),
  output: z.object({
    success: z.boolean(),
    calendarId: z.string(),
    error: z.string().optional(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { ConnectionService } = await import('@morten-olsen/agentic-connection');
    const { CalendarSyncService } = await import('../sync/sync.js');

    const connectionService = services.get(ConnectionService);
    const syncService = services.get(CalendarSyncService);

    const resolved = await connectionService.resolve(userId, input.calendarId);
    if (!resolved) {
      return { success: false, calendarId: input.calendarId, error: 'Connection not found' };
    }

    try {
      const fields = resolved as unknown as CaldavConnectionFields;
      await syncService.syncConnection(userId, input.calendarId, fields);
      return { success: true, calendarId: input.calendarId };
    } catch (error) {
      return {
        success: false,
        calendarId: input.calendarId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export { sync };
