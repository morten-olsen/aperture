import { listChats } from './tools.list-chats.js';
import { createSendMessageTool } from './tools.send-message.js';
import { createSetModelTool } from './tools.set-model.js';
const standardTools = [listChats];
const createChatTools = (chatId) => [
    listChats,
    createSendMessageTool(chatId),
    createSetModelTool(chatId),
];
export { standardTools, createChatTools, listChats };
//# sourceMappingURL=tools.js.map