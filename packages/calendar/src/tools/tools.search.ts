import { createTool } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { searchInputSchema, searchOutputSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';

const search = createTool({
  id: 'calendar.search',
  description: 'Search events by text and/or date range across all calendars or a specific calendar.',
  input: searchInputSchema,
  output: searchOutputSchema,
  invoke: async ({ input, services, userId }) => {
    const db = await services.get(DatabaseService).get(database);

    let query = db
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
      ])
      .where('e.user_id', '=', userId);

    if (input.query) {
      const likePattern = `%${input.query}%`;
      query = query.where((eb) =>
        eb.or([
          eb('e.summary', 'like', likePattern),
          eb('e.description', 'like', likePattern),
          eb('e.location', 'like', likePattern),
        ]),
      );
    }

    if (input.calendarId) {
      query = query.where('e.calendar_id', '=', input.calendarId);
    }

    if (input.from) {
      const from = input.from.includes('T') ? input.from : `${input.from}T00:00:00.000Z`;
      query = query.where('e.start_at', '>=', from);
    }

    if (input.to) {
      const to = input.to.includes('T') ? input.to : `${input.to}T23:59:59.999Z`;
      query = query.where('e.start_at', '<=', to);
    }

    query = query.orderBy('e.start_at', 'asc');

    const limit = input.limit ?? 20;
    query = query.limit(limit);

    const rows = await query.execute();

    const eventMap = new Map<
      string,
      {
        uid: string;
        calendarId: string;
        summary: string;
        description: string | null;
        location: string | null;
        startAt: string;
        endAt: string;
        allDay: boolean;
        isRecurring: boolean;
        notes: {
          id: string;
          content: string;
          createdAt: string;
        }[];
      }
    >();

    for (const row of rows) {
      if (!eventMap.has(row.uid)) {
        eventMap.set(row.uid, {
          uid: row.uid,
          calendarId: row.calendar_id,
          summary: row.summary,
          description: row.description,
          location: row.location,
          startAt: row.start_at,
          endAt: row.end_at,
          allDay: row.all_day === 1,
          isRecurring: row.is_recurring === 1,
          notes: [],
        });
      }

      const event = eventMap.get(row.uid);
      if (event && row.note_id) {
        event.notes.push({
          id: row.note_id,
          content: row.note_content ?? '',
          createdAt: row.note_created_at ?? '',
        });
      }
    }

    return Array.from(eventMap.values());
  },
});

export { search };
