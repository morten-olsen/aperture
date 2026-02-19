import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { SkillService } from '../service/service.js';
import { skillTools } from '../tools/tools.js';

const skillPlugin = createPlugin({
  id: 'skills',
  state: z.object({
    active: z.array(z.string()),
  }),
  prepare: async ({ context, tools, state, services }) => {
    const skillService = services.get(SkillService);
    const skillState = state.getState(skillPlugin);
    const { activeSkills, activeInstructions, activeTools, inactiveSkills } = skillService.prepare(
      skillState?.active || [],
    );

    context.items.push(
      ...activeInstructions.map((item) => ({
        type: 'skill-instruction',
        content: item,
      })),
    );
    tools.push(...activeTools);
    if (activeSkills.length > 0) {
      tools.push(skillTools.deactivate);
    }
    if (inactiveSkills.length > 0) {
      tools.push(skillTools.list, skillTools.activate);
    }
  },
});

export { skillPlugin };
