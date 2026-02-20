import { createPlugin } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { z } from 'zod';

import { blueprintPluginOptionsSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { BlueprintService } from '../service/service.js';
import { blueprintTools } from '../tools/tools.js';

const blueprintStateSchema = z.object({
  lastSearchPromptId: z.string().optional(),
  suggestedBlueprints: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .optional(),
});

const blueprintPlugin = createPlugin({
  id: 'blueprint',
  config: blueprintPluginOptionsSchema,
  state: blueprintStateSchema,
  setup: async ({ config, services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);

    const service = services.get(BlueprintService);
    service.configure(config);
  },
  prepare: async ({ tools, context, prompts, state, services }) => {
    tools.push(...blueprintTools);

    const latestPrompt = [...prompts].reverse().find((p) => p.input !== undefined);
    if (!latestPrompt?.input) {
      context.items.push({
        type: 'blueprint-context',
        content:
          'You can create behavioural blueprints to remember how to handle recurring tasks. Use blueprint.create when you solve a task the user might request again.',
      });
      return;
    }

    const currentState = state.getState(blueprintPlugin);

    let suggested: { id: string; title: string }[];

    if (currentState?.lastSearchPromptId === latestPrompt.id && currentState.suggestedBlueprints) {
      suggested = currentState.suggestedBlueprints;
    } else {
      const service = services.get(BlueprintService);
      const results = await service.search(latestPrompt.input);
      suggested = results.map((r) => ({ id: r.id, title: r.title }));

      state.setState(blueprintPlugin, {
        lastSearchPromptId: latestPrompt.id,
        suggestedBlueprints: suggested,
      });
    }

    if (suggested.length > 0) {
      const lines = [
        'You have behavioural blueprints for recurring tasks. These may be relevant:',
        '',
        ...suggested.map((b) => `- ${b.id}: ${b.title}`),
        '',
        'Use blueprint.get to review the full process before following a blueprint.',
        'If you handle a task that could recur, consider creating a blueprint with blueprint.create.',
        "If you improve on an existing blueprint's process, update it with blueprint.update.",
        'Use the notes field to record observations before committing to process changes.',
      ];
      context.items.push({
        type: 'blueprint-context',
        content: lines.join('\n'),
      });
    } else {
      context.items.push({
        type: 'blueprint-context',
        content:
          'You can create behavioural blueprints to remember how to handle recurring tasks. Use blueprint.create when you solve a task the user might request again.',
      });
    }
  },
});

export { blueprintPlugin };
