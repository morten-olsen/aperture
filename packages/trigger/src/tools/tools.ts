import type { Tool } from '@morten-olsen/agentic-core';

import type { NotifyHandler } from '../schemas/schemas.js';

import { create } from './tools.create.js';
import { createDeleteTool } from './tools.delete.js';
import { invoke } from './tools.invoke.js';
import { list } from './tools.list.js';
import { createNotifyTool } from './tools.notify.js';
import { createUpdateTool } from './tools.update.js';

const triggerTools: Tool[] = [create, list, createUpdateTool(), createDeleteTool(), invoke];

const createCurrentTriggerTools = (triggerId: string, notifyHandler?: NotifyHandler): Tool[] => {
  const tools: Tool[] = [createUpdateTool(triggerId), createDeleteTool(triggerId)];
  if (notifyHandler) {
    tools.push(createNotifyTool(notifyHandler));
  }
  return tools;
};

export { triggerTools, createCurrentTriggerTools, createNotifyTool };
