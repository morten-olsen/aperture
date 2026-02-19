import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { removeTaskInputSchema } from '../schemas/schemas.js';
import { TodoService } from '../service/service.js';

const removeTask = createTool({
  id: 'todo.remove',
  description: 'Remove a task and all its subtasks and tags.',
  input: removeTaskInputSchema,
  output: z.object({
    deleted: z.boolean(),
  }),
  invoke: async ({ input, services, userId }) => {
    const todoService = services.get(TodoService);
    await todoService.remove(userId, input.taskId);
    return { deleted: true };
  },
});

export { removeTask };
