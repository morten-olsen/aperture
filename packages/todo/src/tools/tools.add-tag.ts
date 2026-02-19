import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { tagInputSchema } from '../schemas/schemas.js';
import { TodoService } from '../service/service.js';

const addTag = createTool({
  id: 'todo.add-tag',
  description: 'Add a tag to a task. Idempotent — no-op if the tag already exists.',
  input: tagInputSchema,
  output: z.object({
    taskId: z.string(),
    tags: z.array(z.string()),
  }),
  invoke: async ({ input, services, userId }) => {
    const todoService = services.get(TodoService);
    const tags = await todoService.addTag(userId, input);
    return { taskId: input.taskId, tags };
  },
});

export { addTag };
