import { createTool } from '@morten-olsen/agentic-core';

import { todoTaskSchema, updateTaskInputSchema } from '../schemas/schemas.js';
import { TodoService } from '../service/service.js';

const updateTask = createTool({
  id: 'todo.update',
  description:
    'Update a task. Setting status to "completed" auto-sets completedAt. Pass null to clear optional fields.',
  input: updateTaskInputSchema,
  output: todoTaskSchema,
  invoke: async ({ input, services, userId }) => {
    const todoService = services.get(TodoService);
    const task = await todoService.update(userId, input);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    return task;
  },
});

export { updateTask };
