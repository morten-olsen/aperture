import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { tagInputSchema } from '../schemas/schemas.js';
import { TodoService } from '../service/service.js';

const removeTag = createTool({
  id: 'todo.remove-tag',
  description: 'Remove a tag from a task. Returns the remaining tags.',
  input: tagInputSchema,
  output: z.object({
    taskId: z.string(),
    tags: z.array(z.string()),
  }),
  invoke: async ({ input, services, userId }) => {
    const todoService = services.get(TodoService);
    const tags = await todoService.removeTag(userId, input);
    return { taskId: input.taskId, tags };
  },
});

export { removeTag };
