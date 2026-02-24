import { getTool } from './tools.get.js';
import { listTool } from './tools.list.js';
import { storeTool } from './tools.store.js';

const artifactTools = {
  get: getTool,
  store: storeTool,
  list: listTool,
};

export { artifactTools };
