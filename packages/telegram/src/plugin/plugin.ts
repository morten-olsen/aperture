import { createPlugin, PromptService } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { NotificationService } from '@morten-olsen/agentic-notification';

import type { TelegramPluginOptions } from '../schemas/schemas.js';
import { telegramStateSchema } from '../schemas/schemas.js';
import { database } from '../database/database.js';
import { TelegramBotService } from '../service/service.bot.js';
import { TelegramMessageHandler } from '../service/service.handler.js';
import { standardTools, createChatTools } from '../tools/tools.js';

const createTelegramPlugin = (options: TelegramPluginOptions) =>
  createPlugin({
    id: 'telegram',
    state: telegramStateSchema,
    setup: async ({ services }) => {
      const databaseService = services.get(DatabaseService);
      await databaseService.get(database);

      const notificationService = services.get(NotificationService);
      notificationService.on('published', async (notification) => {
        const user = options.users?.find((user) => user.userId === notification.userId);
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
      botService.start(options.token, options);

      const telegramCompletions = new Map<string, string>();
      let approvalCounter = 0;
      const pendingApprovals = new Map<string, { promptId: string; toolCallId: string }>();

      const promptService = services.get(PromptService);
      promptService.on('created', (completion) => {
        completion.on('completed', async () => {
          const chatId = telegramCompletions.get(completion.id);
          if (!chatId) return;
          telegramCompletions.delete(completion.id);

          const textParts = completion.prompt.output
            .filter((o) => o.type === 'text')
            .map((o) => o.content)
            .filter(Boolean);

          const responseText = textParts.join('\n\n');
          if (responseText) {
            try {
              await botService.sendMessage(chatId, responseText);
            } catch (error) {
              console.error('[Telegram] Error sending response:', error);
            }
          }
        });
      });

      promptService.on('approval-requested', async (completion, request) => {
        const chatId = telegramCompletions.get(completion.id);
        if (!chatId) return;

        approvalCounter += 1;
        const id = String(approvalCounter);
        pendingApprovals.set(id, { promptId: completion.id, toolCallId: request.toolCallId });

        try {
          await botService.sendMessageWithKeyboard(
            chatId,
            `Approval required for ${request.toolName}\n\n${request.reason}\n\nInput: ${JSON.stringify(request.input)}`,
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

      const handler = new TelegramMessageHandler(services, options, telegramCompletions);

      botService.bot.on('message', (ctx) => {
        const text = ctx.text;
        if (!text) return;

        const telegramChatId = String(ctx.chat.id);
        const user = options.users?.find((user) => user.chatId === telegramChatId);

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

const telegramPlugin = createTelegramPlugin({
  token: '',
  users: [],
});

export { createTelegramPlugin, telegramPlugin };
