import { createTool } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { updateNoteInputSchema, updateNoteOutputSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';

const updateNote = createTool({
  id: 'calendar.updateNote',
  description: 'Update an existing note.',
  input: updateNoteInputSchema,
  output: updateNoteOutputSchema,
  invoke: async ({ input, services, userId }) => {
    const db = await services.get(DatabaseService).get(database);

    const existingNote = await db
      .selectFrom('calendar_notes')
      .select(['id', 'event_uid'])
      .where('id', '=', input.noteId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!existingNote) {
      throw new Error(`Note not found: ${input.noteId}`);
    }

    const now = new Date().toISOString();

    await db
      .updateTable('calendar_notes')
      .set({
        content: input.content,
        updated_at: now,
      })
      .where('id', '=', input.noteId)
      .where('user_id', '=', userId)
      .execute();

    return {
      id: input.noteId,
      eventUid: existingNote.event_uid,
      content: input.content,
      updatedAt: now,
    };
  },
});

export { updateNote };
