import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { triggerReferenceSchema } from '../schemas/schemas.js';
import { TriggerService } from '../service/service.js';
import { createCurrentTriggerTools, triggerTools } from '../tools/tools.js';
import { database } from '../database/database.js';

const triggerPlugin = createPlugin({
  id: 'trigger',
  state: z.object({
    from: triggerReferenceSchema,
  }),
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    const db = await databaseService.get(database);
    const result = await db.selectFrom('triggers_triggers').selectAll().execute();
    console.log(result);
  },
  prepare: async ({ tools, context, state, services }) => {
    tools.push(...triggerTools);
    const triggerState = state.getState(triggerPlugin);
    if (!triggerState?.from) {
      return;
    }
    const triggerService = services.get(TriggerService);
    const trigger = await triggerService.get(triggerState.from.id);
    if (triggerState.from.type !== 'once') {
      tools.push(...createCurrentTriggerTools(triggerState.from.id));
    }
    if (trigger.continuation) {
      context.items.push({
        type: 'trigger-continuation',
        content: `Your continuation message from last run was\n\n${trigger.continuation}`,
      });
    }
  },
});

export { triggerPlugin };
