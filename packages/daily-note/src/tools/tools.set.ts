import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const set = createTool({
  id: 'daily-note.set',
  description:
    'Set the daily note for a specific date. Defaults to today if no date is provided. Overwrites any existing note for that date.',
  input: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Date in YYYY-MM-DD format. Defaults to today.'),
    content: z.string().max(2000).describe('The note content (max 2000 characters).'),
  }),
  output: z.object({
    date: z.string(),
    content: z.string(),
    updatedAt: z.string(),
  }),
  invoke: async ({ input, services, userId }) => {
    const { DailyNoteRepo } = await import('../repo/repo.js');
    const repo = new DailyNoteRepo(services);
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const note = await repo.set(userId, date, input.content);
    return {
      date: note.date,
      content: note.content,
      updatedAt: note.updatedAt,
    };
  },
});

export { set };
