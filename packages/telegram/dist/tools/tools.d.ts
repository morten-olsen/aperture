import type { Tool } from '@morten-olsen/agentic-core';
import { listChats } from './tools.list-chats.js';
declare const standardTools: Tool[];
declare const createChatTools: (chatId: string) => Tool[];
export { standardTools, createChatTools, listChats };
//# sourceMappingURL=tools.d.ts.map