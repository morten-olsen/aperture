import type { Tool } from '@morten-olsen/agentic-core';

import { create } from './tools.create.js';

const triggerTools: Tool[] = [create];
const createCurrentTriggerTools = (id: string): Tool[] => [];

export { triggerTools, createCurrentTriggerTools };
