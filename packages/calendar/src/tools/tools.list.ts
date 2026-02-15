import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';
import { listOutputSchema } from '../schemas/schemas.js';

const list = createTool({
  id: 'calendar.list',
  description: 'List all configured calendars with their last sync time.',
  input: z.object({}),
  output: listOutputSchema,
  invoke: async ({ services }) => {
    const { CalendarSyncService } = await import('../sync/sync.js');

    const syncService = services.get(CalendarSyncService);
    const sources = syncService.getSources();

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      color: source.color,
      lastSyncedAt: syncService.getLastSyncTime(source.id),
    }));
  },
});

export { list };
