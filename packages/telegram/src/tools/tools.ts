import type { Tool } from '@morten-olsen/agentic-core';

import { listChats } from './tools.list-chats.js';
import { createSendMessageTool } from './tools.send-message.js';
import { createSetModelTool } from './tools.set-model.js';

const standardTools: Tool[] = [listChats];

const createChatTools = (chatId: string): Tool[] => [
  listChats,
  createSendMessageTool(chatId),
  createSetModelTool(chatId),
];

export { standardTools, createChatTools, listChats };
