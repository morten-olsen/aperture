import 'dotenv/config';
import { inspect } from 'node:util';

import { ConversationService } from '@morten-olsen/agentic-conversation';
import { triggerPlugin } from '@morten-olsen/agentic-trigger';
import { createTelegramPlugin } from '@morten-olsen/agentic-telegram';

import { PluginService, Services } from '../../core/dist/exports.js';

const services = new Services();
const conversationService = services.get(ConversationService);
const pluginService = services.get(PluginService);

await pluginService.register(
  triggerPlugin,
  createTelegramPlugin({
    token: process.env.TELEGRAM_TOKEN!,
    defaultModel: 'google/gemini-3-flash-preview',
    allowedChatIds: [process.env.TELEGRAM_USER_ID!],
  }),
);
