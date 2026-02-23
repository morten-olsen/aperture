import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listOutputSchema } from '../schemas/schemas.js';

const list = createTool({
  id: 'calendar.list',
  description: 'List all configured calendars with their last sync time.',
  input: z.object({}),
  output: listOutputSchema,
  invoke: async ({ services, userId }) => {
    const { ConnectionService } = await import('@morten-olsen/agentic-connection');
    const { CalendarSyncService } = await import('../sync/sync.js');

    const connectionService = services.get(ConnectionService);
    const syncService = services.get(CalendarSyncService);
    const connections = await connectionService.list(userId, 'caldav');

    return connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      lastSyncedAt: syncService.getLastSyncTime(connection.id),
    }));
  },
});

export { list };
