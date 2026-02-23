import type { Tool } from '@morten-olsen/agentic-core';

import { conversationCreateTool } from './tools.create.js';
import { conversationDeleteTool } from './tools.delete.js';
import { conversationGetTool } from './tools.get.js';
import { conversationGetActiveTool } from './tools.get-active.js';
import { conversationListTool } from './tools.list.js';
import { conversationSetActiveTool } from './tools.set-active.js';
import { promptGetTool } from './tools.prompt-get.js';
import { promptSearchTool } from './tools.prompt-search.js';

const conversationApiTools: Tool[] = [
  conversationCreateTool,
  conversationListTool,
  conversationGetTool,
  conversationGetActiveTool,
  conversationSetActiveTool,
  conversationDeleteTool,
  promptGetTool,
  promptSearchTool,
];

export {
  conversationApiTools,
  conversationCreateTool,
  conversationListTool,
  conversationGetTool,
  conversationGetActiveTool,
  conversationSetActiveTool,
  conversationDeleteTool,
  promptGetTool,
  promptSearchTool,
};
