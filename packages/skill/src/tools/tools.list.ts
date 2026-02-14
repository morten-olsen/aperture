import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { SkillService } from '../service/service.js';

const listTool = createTool({
  id: 'skill.list',
  description: 'Get a list of available skills',
  input: z.object({}),
  output: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
    }),
  ),
  invoke: async ({ state, services }) => {
    const { skillPlugin } = await import('../plugin/plugin.js');
    const skillState = state.getState(skillPlugin);
    const activeSkills = skillState?.active || [];
    const skillService = services.get(SkillService);
    const inactiveSkills = skillService.skills.filter((skill) => !activeSkills.includes(skill.id));
    return inactiveSkills.map((skill) => ({
      id: skill.id,
      description: skill.description,
    }));
  },
});

export { listTool };
