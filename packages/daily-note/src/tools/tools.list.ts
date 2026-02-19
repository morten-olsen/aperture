import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const list = createTool({
  id: 'daily-note.list',
  description: 'List daily notes, optionally filtered by date range.',
  input: z.object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Start date (inclusive) in YYYY-MM-DD format.'),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('End date (inclusive) in YYYY-MM-DD format.'),
    limit: z.number().int().min(1).max(100).optional().describe('Max notes to return (default 14).'),
  }),
  output: z.object({
    notes: z.array(
      z.object({
        date: z.string(),
        content: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  invoke: async ({ input, services, userId }) => {
    const { DailyNoteRepo } = await import('../repo/repo.js');
    const repo = new DailyNoteRepo(services);
    const notes = await repo.list(userId, {
      from: input.from,
      to: input.to,
      limit: input.limit,
    });
    return {
      notes: notes.map((n) => ({
        date: n.date,
        content: n.content,
        updatedAt: n.updatedAt,
      })),
    };
  },
});

export { list };
