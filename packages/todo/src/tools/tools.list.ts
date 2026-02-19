import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listTasksInputSchema, todoTaskSchema } from '../schemas/schemas.js';
import { TodoService } from '../service/service.js';

const listTasks = createTool({
  id: 'todo.list',
  description:
    'List tasks with optional filters. Set parentId to null to get only top-level tasks. Use tags to filter by all matching tags.',
  input: listTasksInputSchema,
  output: z.object({
    tasks: z.array(todoTaskSchema),
    total: z.number(),
  }),
  invoke: async ({ input, services, userId }) => {
    const todoService = services.get(TodoService);
    const tasks = await todoService.list(userId, input);
    return { tasks, total: tasks.length };
  },
});

export { listTasks };
