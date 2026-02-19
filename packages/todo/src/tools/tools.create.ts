import { createTool } from '@morten-olsen/agentic-core';

import { createTaskInputSchema, todoTaskSchema } from '../schemas/schemas.js';
import { TodoService } from '../service/service.js';

const createTask = createTool({
  id: 'todo.create',
  description: 'Create a new task. Supports subtasks via parentId, priorities, projects, and tags.',
  input: createTaskInputSchema,
  output: todoTaskSchema,
  invoke: async ({ input, services, userId }) => {
    const todoService = services.get(TodoService);
    return todoService.create(userId, input);
  },
});

export { createTask };
