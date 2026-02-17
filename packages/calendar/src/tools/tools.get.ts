import { createTool } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { getInputSchema, getOutputSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';

const get = createTool({
  id: 'calendar.get',
  description: 'Get full details of a single event by UID.',
  input: getInputSchema,
  output: getOutputSchema,
  invoke: async ({ input, services }) => {
    const db = await services.get(DatabaseService).get(database);

    const rows = await db
      .selectFrom('calendar_events as e')
      .leftJoin('calendar_notes as n', 'n.event_uid', 'e.uid')
      .select([
        'e.uid',
        'e.calendar_id',
        'e.summary',
        'e.description',
        'e.location',
        'e.start_at',
        'e.end_at',
        'e.all_day',
        'e.is_recurring',
        'n.id as note_id',
        'n.content as note_content',
        'n.created_at as note_created_at',
        'n.updated_at as note_updated_at',
      ])
      .where('e.uid', '=', input.uid)
      .execute();

    if (rows.length === 0) {
      throw new Error(`Event not found: ${input.uid}`);
    }

    const firstRow = rows[0];
    const notes: {
      id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
    }[] = [];

    for (const row of rows) {
      if (row.note_id) {
        notes.push({
          id: row.note_id,
          content: row.note_content ?? '',
          createdAt: row.note_created_at ?? '',
          updatedAt: row.note_updated_at ?? '',
        });
      }
    }

    return {
      uid: firstRow.uid,
      calendarId: firstRow.calendar_id,
      summary: firstRow.summary,
      description: firstRow.description,
      location: firstRow.location,
      startAt: firstRow.start_at,
      endAt: firstRow.end_at,
      allDay: firstRow.all_day === 1,
      isRecurring: firstRow.is_recurring === 1,
      notes,
    };
  },
});

export { get };
