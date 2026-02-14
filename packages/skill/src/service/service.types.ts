import type { Tool } from '@morten-olsen/agentic-core';

type SkillDefinition = {
  id: string;
  description: string;
  instruction?: string;
  tools?: Tool[];
};

export type { SkillDefinition };
