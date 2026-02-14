import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const deactivateTool = createTool({
  id: 'skill.deactivate',
  description: 'Deactivate skill',
  input: z.object({
    id: z.string(),
  }),
  output: z.object({
    success: z.boolean(),
  }),
  invoke: async ({ input, state }) => {
    const { skillPlugin } = await import('../plugin/plugin.js');
    const skillState = state.getState(skillPlugin);
    const skillList = (skillState?.active || []).filter((skill) => skill !== input.id);
    state.setState(skillPlugin, {
      ...skillState,
      active: skillList,
    });
    return {
      success: true,
    };
  },
});

export { deactivateTool };
