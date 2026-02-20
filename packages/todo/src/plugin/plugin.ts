import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { database } from '../database/database.js';
import { TodoService } from '../service/service.js';
import { todoTools } from '../tools/tools.js';

const todoPlugin = createPlugin({
  id: 'todo',
  name: 'Todo',
  description: 'Task management with subtasks, priorities, projects, and tags',
  config: z.unknown(),
  state: z.unknown(),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);
  },
  prepare: async ({ tools, context, services, userId }) => {
    tools.push(...todoTools);

    const todoService = services.get(TodoService);
    const summary = await todoService.getOverdueSummary(userId);

    if (summary.overdueCount > 0 || summary.urgentPendingCount > 0) {
      const parts: string[] = [];

      if (summary.overdueCount > 0) {
        parts.push(`${summary.overdueCount} overdue task(s)`);
      }

      if (summary.urgentPendingCount > 0) {
        parts.push(`${summary.urgentPendingCount} urgent task(s): ${summary.urgentTitles.join(', ')}`);
      }

      context.items.push({
        type: 'todo-alert',
        content: `Task alerts: ${parts.join('. ')}.`,
      });
    }
  },
});

export { todoPlugin };
