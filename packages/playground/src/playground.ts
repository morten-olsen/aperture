import 'dotenv/config';

import { triggerPlugin } from '@morten-olsen/agentic-trigger';
import { createTelegramPlugin } from '@morten-olsen/agentic-telegram';

import { PluginService, Services } from '../../core/dist/exports.js';

const services = new Services({
  provider: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL ?? '',
  },
  models: {
    normal: 'google/gemini-3-flash-preview',
    high: 'google/gemini-3-flash-preview',
  },
});
const pluginService = services.get(PluginService);

await pluginService.register(
  triggerPlugin,
  createTelegramPlugin({
    token: process.env.TELEGRAM_TOKEN ?? '',
    users: [],
  }),
);
