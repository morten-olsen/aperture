import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const activateTool = createTool({
  id: 'skill.activate',
  description: 'Activate skill',
  input: z.object({
    id: z.string(),
  }),
  output: z.object({
    success: z.boolean(),
  }),
  invoke: async ({ input, state }) => {
    const { skillPlugin } = await import('../plugin/plugin.js');
    const skillState = state.getState(skillPlugin);
    const skillList = [...new Set([...(skillState?.active || []), input.id])];
    state.setState(skillPlugin, {
      ...skillState,
      active: skillList,
    });
    return {
      success: true,
    };
  },
});

export { activateTool };
