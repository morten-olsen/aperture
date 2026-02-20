import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { database } from '../database/database.js';
import { DailyNoteRepo } from '../repo/repo.js';
import { dailyNoteTools } from '../tools/tools.js';

const dailyNotePlugin = createPlugin({
  id: 'daily-note',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);
  },
  prepare: async ({ tools, context, services, userId }) => {
    tools.push(...dailyNoteTools);

    context.items.push({
      type: 'daily-note-guide',
      content: [
        'You have a daily note system. Use it to persist short per-day memory (max 2000 chars).',
        'Use daily-note.set to update the note for today (or any date — one note per day, overwrites previous), daily-note.get to read one, and daily-note.list to browse recent notes.',
        'Proactively save things the user might want you to remember on specific days (plans, decisions, reminders).',
      ].join('\n'),
    });

    const repo = new DailyNoteRepo(services);
    const today = new Date().toISOString().slice(0, 10);
    const note = await repo.get(userId, today);

    if (note) {
      context.items.push({
        type: 'daily-note',
        content: `Today's note (${today}):\n${note.content}`,
      });
    }
  },
});

export { dailyNotePlugin };
