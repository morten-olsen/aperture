import { createTool } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { deleteNoteInputSchema, deleteNoteOutputSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';

const deleteNote = createTool({
  id: 'calendar.deleteNote',
  description: 'Remove a note.',
  input: deleteNoteInputSchema,
  output: deleteNoteOutputSchema,
  invoke: async ({ input, services, userId }) => {
    const db = await services.get(DatabaseService).get(database);

    const result = await db
      .deleteFrom('calendar_notes')
      .where('id', '=', input.noteId)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (result.numDeletedRows === BigInt(0)) {
      throw new Error(`Note not found: ${input.noteId}`);
    }

    return {
      success: true,
    };
  },
});

export { deleteNote };
