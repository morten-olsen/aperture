import {
  createPlugin,
  FileSystemService,
  PromptService,
  EventService,
  promptCreatedEvent,
  promptCompletedEvent,
  promptApprovalRequestedEvent,
} from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { notificationPublishedEvent } from '@morten-olsen/agentic-notification';
import { triggerPlugin } from '@morten-olsen/agentic-trigger';

import { telegramPluginOptionsSchema, telegramStateSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { TelegramBotService } from '../service/service.bot.js';
import { TelegramMessageHandler } from '../service/service.handler.js';
import { standardTools, createChatTools } from '../tools/tools.js';

const telegramPlugin = createPlugin({
  id: 'telegram',
  config: telegramPluginOptionsSchema,
  state: telegramStateSchema,
  setup: async ({ config, services }) => {
    const databaseService = services.get(DatabaseService);
    await databaseService.get(database);

    const eventService = services.get(EventService);
    eventService.listen(notificationPublishedEvent, async (notification) => {
      const user = config.users?.find((user) => user.userId === notification.userId);
      if (!user) {
        return;
      }
      try {
        await botService.sendMessage(user.chatId, notification.body);
      } catch (error) {
        console.error('[Telegram] Error sending response:', error);
      }
    });

    const botService = services.get(TelegramBotService);
    botService.start(config.token, config);

    const telegramCompletions = new Map<string, string>();
    let approvalCounter = 0;
    const pendingApprovals = new Map<string, { promptId: string; toolCallId: string }>();
    const triggerInitiatedPrompts = new Set<string>();

    const resolveChatId = (completionId: string): string | undefined => {
      return telegramCompletions.get(completionId);
    };

    const promptService = services.get(PromptService);

    eventService.listen(promptCreatedEvent, (data) => {
      const completion = promptService.getActive(data.promptId);
      if (!completion) return;
      const triggerState = completion.state.getState(triggerPlugin);
      if (triggerState?.from.id) {
        triggerInitiatedPrompts.add(data.promptId);
      }
    });

    eventService.listen(promptCompletedEvent, async (data, options) => {
      if (triggerInitiatedPrompts.has(data.promptId)) {
        triggerInitiatedPrompts.delete(data.promptId);
        return;
      }

      const userId = options.userId;
      if (!userId) return;
      const chatId = resolveChatId(data.promptId);
      if (!chatId) return;
      telegramCompletions.delete(data.promptId);

      const textParts = data.output
        .filter((o) => o.type === 'text')
        .map((o) => (o as { content?: string }).content)
        .filter(Boolean);

      const responseText = textParts.join('\n\n');
      if (responseText) {
        try {
          await botService.sendMessage(chatId, responseText);
        } catch (error) {
          console.error('[Telegram] Error sending response:', error);
        }
      }

      const fileOutputs = data.output.filter((o) => o.type === 'file');
      for (const fileOutput of fileOutputs) {
        try {
          const fs = services.get(FileSystemService);
          const fo = fileOutput as { path: string; description?: string };
          const result = await fs.read(userId, fo.path);
          if (result) {
            await botService.sendDocument(chatId, result.data, fo.path, fo.description);
          }
        } catch (error) {
          console.error('[Telegram] Error sending file:', error);
        }
      }
    });

    eventService.listen(promptApprovalRequestedEvent, async (data) => {
      const chatId = resolveChatId(data.promptId);
      if (!chatId) return;

      approvalCounter += 1;
      const id = String(approvalCounter);
      pendingApprovals.set(id, { promptId: data.promptId, toolCallId: data.request.toolCallId });

      try {
        await botService.sendMessageWithKeyboard(
          chatId,
          `Approval required for ${data.request.toolName}\n\n${data.request.reason}\n\nInput: ${JSON.stringify(data.request.input)}`,
          [
            [
              { text: 'Approve', callback_data: `a:${id}` },
              { text: 'Reject', callback_data: `r:${id}` },
            ],
          ],
        );
      } catch (error) {
        console.error('[Telegram] Error sending approval request:', error);
      }
    });

    botService.bot.on('callback_query', async (ctx) => {
      const data = ctx.data;
      if (!data) return;

      const [action, id] = data.split(':');
      if (!id) return;

      const pending = pendingApprovals.get(id);
      if (!pending) {
        await ctx.answer({ text: 'This approval request has expired.' });
        return;
      }

      const completion = promptService.getActive(pending.promptId);
      if (!completion) {
        pendingApprovals.delete(id);
        await ctx.answer({ text: 'This approval request has expired.' });
        return;
      }

      pendingApprovals.delete(id);

      if (action === 'a') {
        await ctx.answer({ text: 'Approved' });
        await completion.approve(pending.toolCallId);
      } else if (action === 'r') {
        await ctx.answer({ text: 'Rejected' });
        await completion.reject(pending.toolCallId, 'Rejected by user via Telegram');
      }
    });

    const handler = new TelegramMessageHandler(services, config, telegramCompletions);

    botService.bot.on('message', (ctx) => {
      const text = ctx.text;
      if (!text) return;

      const telegramChatId = String(ctx.chat.id);
      const user = config.users?.find((user) => user.chatId === telegramChatId);

      if (!user) {
        return;
      }

      handler.handle(telegramChatId, text, {
        chatType: ctx.chat.type,
        title: 'title' in ctx.chat ? ctx.chat.title : undefined,
        username: ctx.from?.username,
        firstName: ctx.from?.firstName,
      });
    });
  },
  prepare: async ({ tools, context, state }) => {
    const telegramState = state.getState(telegramPlugin);

    if (!telegramState?.chat) {
      tools.push(...standardTools);
      return;
    }

    const { chat } = telegramState;
    tools.push(...createChatTools(chat.telegramChatId));

    const parts = [`You are chatting with a user via Telegram (${chat.chatType} chat).`];
    if (chat.username) {
      parts.push(`Username: ${chat.username}`);
    }
    if (chat.title) {
      parts.push(`Chat title: ${chat.title}`);
    }

    context.items.push({
      type: 'telegram-context',
      content: parts.join('\n'),
    });
  },
});

export { telegramPlugin };
