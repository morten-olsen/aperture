import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { notifyTool } from '@morten-olsen/agentic-notification';

import { triggerReferenceSchema } from '../schemas/schemas.js';
import { TriggerScheduler } from '../scheduler/scheduler.js';
import { createCurrentTriggerTools, triggerTools } from '../tools/tools.js';
import { database } from '../database/database.js';

const triggerStateSchema = z.object({
  from: triggerReferenceSchema,
});

const triggerPlugin = createPlugin({
  id: 'trigger',
  state: triggerStateSchema,
  setup: async ({ services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);
    const scheduler = services.get(TriggerScheduler);
    await scheduler.load();
    scheduler.start();
  },
  prepare: async ({ tools, context, state, services }) => {
    const triggerState = state.getState(triggerPlugin);

    if (!triggerState?.from) {
      tools.push(...triggerTools);
      return;
    }

    tools.push(notifyTool);

    const scheduler = services.get(TriggerScheduler);
    const trigger = await scheduler.get(triggerState.from.id);

    if (!trigger) {
      tools.push(...triggerTools);
      return;
    }

    const standardToolIds = new Set(['trigger.create', 'trigger.list']);
    tools.push(...triggerTools.filter((t) => standardToolIds.has(t.id)));
    tools.push(...createCurrentTriggerTools(triggerState.from.id));

    const contextParts = [
      'You are running from a scheduled trigger. The user will not see this conversation directly.',
      `Your goal: ${trigger.goal}`,
    ];

    if (trigger.setupContext) {
      contextParts.push(`Context: ${trigger.setupContext}`);
    }

    if (trigger.continuation) {
      contextParts.push(`Note from your previous invocation:\n"${trigger.continuation}"`);
    }

    contextParts.push(
      'If you discover something the user should know, use the trigger.notify tool.',
      'Before completing, use trigger.update with a "continuation" note for your next invocation.',
    );

    context.items.push({
      type: 'trigger-context',
      content: contextParts.join('\n\n'),
    });
  },
});

export { triggerPlugin };
