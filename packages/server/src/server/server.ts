import { FileSystemProviderDisk, PluginService, Services } from '@morten-olsen/agentic-core';
import { apiPlugin, ApiService } from '@morten-olsen/agentic-api';
import { artifactPlugin } from '@morten-olsen/agentic-artifact';
import { personalityPlugin } from '@morten-olsen/agentic-personality';
import { dailyNotePlugin } from '@morten-olsen/agentic-daily-note';
import { databasePlugin } from '@morten-olsen/agentic-database';
import { conversationPlugin, conversationApiTools } from '@morten-olsen/agentic-conversation';
import { triggerPlugin, triggerTools } from '@morten-olsen/agentic-trigger';
import { calendarPlugin, calendarPluginOptionsSchema } from '@morten-olsen/agentic-calendar';
import { telegramPlugin, telegramPluginOptionsSchema } from '@morten-olsen/agentic-telegram';
import { filesystemPlugin } from '@morten-olsen/agentic-filesystem';
import { shellPlugin } from '@morten-olsen/agentic-shell';
import { sshPlugin } from '@morten-olsen/agentic-ssh';
import { webFetchPlugin } from '@morten-olsen/agentic-web-fetch';
import { blueprintPlugin, blueprintApiTools } from '@morten-olsen/agentic-blueprint';
import { locationPlugin } from '@morten-olsen/agentic-location';
import { weatherPlugin } from '@morten-olsen/agentic-weather';
import { homeAssistantPlugin } from '@morten-olsen/agentic-home-assistant';
import { interpreterPlugin, InterpreterService } from '@morten-olsen/agentic-interpreter';
import { timePlugin } from '@morten-olsen/agentic-time';
import { todoPlugin, todoApiTools } from '@morten-olsen/agentic-todo';
import { usagePlugin } from '@morten-olsen/agentic-usage';

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
    fileSystem: config.files.location ? new FileSystemProviderDisk(config.files.location) : undefined,
  });
  const pluginService = services.get(PluginService);

  const interpreterService = services.get(InterpreterService);
  interpreterService.expose({
    name: 'fetch',
    description: 'fetch(url, options?) — HTTP request, returns {status, headers, body}',
    fn: async (url: unknown, options?: unknown) => {
      const response = await fetch(url as string, options as RequestInit);
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      };
    },
  });

  await pluginService.register(databasePlugin, {
    location: config.database.location,
    embeddings: {
      provider: config.embeddings.provider as 'openai' | 'local',
      model: config.embeddings.model,
      dimensions: config.embeddings.dimensions,
    },
  });
  await pluginService.register(conversationPlugin, undefined);
  await pluginService.register(timePlugin, undefined);
  await pluginService.register(artifactPlugin, undefined);
  await pluginService.register(interpreterPlugin, undefined);

  if (config.files.enabled) {
    await pluginService.register(filesystemPlugin, undefined);
  }

  if (config.todo.enabled) {
    await pluginService.register(todoPlugin, undefined);
  }

  if (config.personality.enabled) {
    await pluginService.register(personalityPlugin, undefined);
  }

  if (config.dailyNote.enabled) {
    await pluginService.register(dailyNotePlugin, undefined);
  }

  if (config.trigger.enabled) {
    await pluginService.register(triggerPlugin, undefined);
  }

  if (config.calendar.enabled) {
    await pluginService.register(
      calendarPlugin,
      calendarPluginOptionsSchema.parse({
        sources: config.calendar.sources,
        defaultSyncIntervalMinutes: config.calendar.defaultSyncIntervalMinutes,
        injectTodayAgenda: config.calendar.injectTodayAgenda,
        expansionWindow: {
          pastMonths: config.calendar.expansionWindow.pastMonths,
          futureMonths: config.calendar.expansionWindow.futureMonths,
        },
      }),
    );
  }

  if (config.telegram.enabled) {
    await pluginService.register(
      telegramPlugin,
      telegramPluginOptionsSchema.parse({
        token: config.telegram.token,
        users: config.telegram.users,
      }),
    );
  }

  if (config.location.enabled) {
    await pluginService.register(locationPlugin, undefined);
  }

  if (config.weather.enabled) {
    await pluginService.register(weatherPlugin, undefined);
  }

  if (config.homeAssistant.enabled) {
    await pluginService.register(homeAssistantPlugin, {
      url: config.homeAssistant.url,
      token: config.homeAssistant.token,
      locationTracking: config.homeAssistant.locationTracking as { entity: string; userId: string }[],
    });
  }

  if (config.blueprint.enabled) {
    await pluginService.register(blueprintPlugin, {
      topN: config.blueprint.topN,
      maxDistance: config.blueprint.maxDistance,
    });
  }

  if (config.usage.enabled) {
    await pluginService.register(usagePlugin, undefined);
  }

  if (config.shell.enabled) {
    await pluginService.register(shellPlugin, {
      timeout: config.shell.timeout,
      maxOutputLength: config.shell.maxOutputLength,
      shell: config.shell.shell,
    });
  }

  if (config.ssh.enabled) {
    await pluginService.register(sshPlugin, {
      timeout: config.ssh.timeout,
      maxOutputLength: config.ssh.maxOutputLength,
    });
  }

  if (config.webFetch.enabled) {
    await pluginService.register(webFetchPlugin, {
      maxCharacters: config.webFetch.maxCharacters,
      defaultMode: config.webFetch.defaultMode as 'html' | 'markdown' | 'links',
      userAgent: config.webFetch.userAgent,
    });
  }

  if (config.api.enabled) {
    const apiService = services.get(ApiService);
    apiService.exposeTools(conversationApiTools, { tag: 'Conversations' });
    if (config.trigger.enabled) {
      apiService.exposeTools(triggerTools, { tag: 'Triggers' });
    }
    if (config.todo.enabled) {
      apiService.exposeTools(todoApiTools, { tag: 'Todos' });
    }
    if (config.blueprint.enabled) {
      apiService.exposeTools(blueprintApiTools, { tag: 'Blueprints' });
    }
    await pluginService.register(apiPlugin, {
      port: config.api.port,
      host: config.api.host,
      prefix: '/api',
      cors: config.api.corsOrigin ? { origin: config.api.corsOrigin } : undefined,
    });
  }

  await pluginService.start();

  console.log('[glados] Server started');
  console.log('[glados]   artifact: enabled');
  console.log('[glados]   interpreter: enabled');
  console.log(`[glados]   todo: ${config.todo.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   personality: ${config.personality.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   daily-note: ${config.dailyNote.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   trigger: ${config.trigger.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   calendar: ${config.calendar.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   telegram: ${config.telegram.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   location: ${config.location.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   weather: ${config.weather.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   home-assistant: ${config.homeAssistant.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   blueprint: ${config.blueprint.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   usage: ${config.usage.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   shell: ${config.shell.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   ssh: ${config.ssh.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   filesystem: ${config.files.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   web-fetch: ${config.webFetch.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[glados]   api: ${config.api.enabled ? `enabled (port ${config.api.port})` : 'disabled'}`);

  return { services };
};

export { startServer };
export type { StartServerOptions };
