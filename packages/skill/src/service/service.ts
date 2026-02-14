import type { SkillDefinition } from './service.types.js';

class SkillService {
  #skills: Record<string, SkillDefinition>;

  constructor() {
    this.#skills = {};
  }

  public get skills() {
    return Object.values(this.#skills);
  }

  public registerSkill = (skill: SkillDefinition) => {
    this.#skills[skill.id] = skill;
  };

  public prepare = (active: string[]) => {
    const activeSkills = Object.values(this.#skills).filter((skill) => active.includes(skill.id));

    const instructions = activeSkills.map((skill) => {
      if (skill.instruction) {
        return `active skill ${skill.id}:\n\n${skill.instruction}`;
      } else {
        return `active skill ${skill.id}`;
      }
    });
    const tools = activeSkills.flatMap((skill) => skill.tools || []);

    return {
      instructions,
      tools,
    };
  };
}

export { SkillService };
