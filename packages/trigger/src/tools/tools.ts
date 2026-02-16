import type { Tool } from '@morten-olsen/agentic-core';

import { create } from './tools.create.js';
import { createDeleteTool } from './tools.delete.js';
import { invoke } from './tools.invoke.js';
import { list } from './tools.list.js';
import { createUpdateTool } from './tools.update.js';

const triggerTools: Tool[] = [create, list, createUpdateTool(), createDeleteTool(), invoke];

const createCurrentTriggerTools = (triggerId: string): Tool[] => {
  const tools: Tool[] = [createUpdateTool(triggerId), createDeleteTool(triggerId)];
  return tools;
};

export { triggerTools, createCurrentTriggerTools };
