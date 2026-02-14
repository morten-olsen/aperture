import { activateTool } from './tools.activate.js';
import { deactivateTool } from './tools.deactivate.js';
import { listTool } from './tools.list.js';

const skillTools = {
  activate: activateTool,
  deactivate: deactivateTool,
  list: listTool,
};

export { skillTools };
