import { PluginService, Services } from '@morten-olsen/agentic-core';
import { createDatabasePlugin } from '@morten-olsen/agentic-database';
import { conversationPlugin } from '@morten-olsen/agentic-conversation';
import { triggerPlugin } from '@morten-olsen/agentic-trigger';
import { createCalendarPlugin, calendarPluginOptionsSchema } from '@morten-olsen/agentic-calendar';
import { createTelegramPlugin } from '@morten-olsen/agentic-telegram';
import type { Plugin } from '@morten-olsen/agentic-core';
import type { ZodType } from 'zod';

import type { ServerConfig } from '../config/config.js';

type StartServerOptions = {
  config: ServerConfig;
};

const startServer = async ({ config }: StartServerOptions) => {
  const services = new Services({
    provider: {
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
    },
    models: {
      normal: config.model.normal,
      high: config.model.high || config.model.normal,
    },
  });
  const pluginService = services.get(PluginService);

  const plugins: Plugin<ZodType>[] = [
    createDatabasePlugin({
      location: config.database.location,
    }),
    conversationPlugin,
  ];

  if (config.trigger.enabled) {
    plugins.push(triggerPlugin);
  }

  if (config.calendar.enabled) {
    const calendarOptions = calendarPluginOptionsSchema.parse({
      sources: config.calendar.sources,
      defaultSyncIntervalMinutes: config.calendar.defaultSyncIntervalMinutes,
      injectTodayAgenda: config.calendar.injectTodayAgenda,
      expansionWindow: {
        pastMonths: config.calendar.expansionWindow.pastMonths,
        futureMonths: config.calendar.expansionWindow.futureMonths,
      },
    });
    plugins.push(createCalendarPlugin(calendarOptions));
  }

  if (config.telegram.enabled) {
    if (!config.telegram.token) {
      throw new Error('Telegram is enabled but no token is configured');
    }
    const chatIds = config.telegram.allowedChatIds;
    plugins.push(
      createTelegramPlugin({
        token: config.telegram.token,
        allowedChatIds: chatIds.length > 0 ? chatIds : undefined,
      }),
    );
  }

  await pluginService.register(...plugins);

  console.log('[glados] Server started');
  console.log(`[glados]   trigger: ${config.trigger.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   calendar: ${config.calendar.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   telegram: ${config.telegram.enabled ? 'enabled' : 'disabled'}`);

  return { services };
};

export { startServer };
export type { StartServerOptions };
