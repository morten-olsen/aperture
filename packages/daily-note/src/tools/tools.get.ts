import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const get = createTool({
  id: 'daily-note.get',
  description: 'Get the daily note for a specific date. Defaults to today if no date is provided.',
  input: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Date in YYYY-MM-DD format. Defaults to today.'),
  }),
  output: z.object({
    date: z.string(),
    content: z.string().nullable(),
    updatedAt: z.string().nullable(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { DailyNoteRepo } = await import('../repo/repo.js');
    const repo = new DailyNoteRepo(services);
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const note = await repo.get(userId, date);
    return {
      date,
      content: note?.content ?? null,
      updatedAt: note?.updatedAt ?? null,
    };
  },
});

export { get };
