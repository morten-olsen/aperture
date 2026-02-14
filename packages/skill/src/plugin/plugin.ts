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
    const fromSkills = skillService.prepare(skillState?.active || []);

    context.items.push(
      ...fromSkills.instructions.map((item) => ({
        type: 'skill-instruction',
        content: item,
      })),
    );
    tools.push(...fromSkills.tools);
    tools.push(...Object.values(skillTools));
  },
});

export { skillPlugin };
