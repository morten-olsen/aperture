import { randomUUID } from 'crypto';

import { createTool } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { addNoteInputSchema, addNoteOutputSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';

const addNote = createTool({
  id: 'calendar.addNote',
  description: 'Add a note to an event.',
  input: addNoteInputSchema,
  output: addNoteOutputSchema,
  invoke: async ({ input, services }) => {
    const db = await services.get(DatabaseService).get(database);

    const event = await db
      .selectFrom('calendar_events')
      .select('uid')
      .where('uid', '=', input.eventUid)
      .executeTakeFirst();

    if (!event) {
      throw new Error(`Event not found: ${input.eventUid}`);
    }

    const noteId = randomUUID();
    const now = new Date().toISOString();

    await db
      .insertInto('calendar_notes')
      .values({
        id: noteId,
        event_uid: input.eventUid,
        content: input.content,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id: noteId,
      eventUid: input.eventUid,
      content: input.content,
      createdAt: now,
    };
  },
});

export { addNote };
