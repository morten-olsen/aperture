import { randomUUID } from 'node:crypto';

import type { Services } from '@morten-olsen/agentic-core';
import { ConversationService } from '@morten-olsen/agentic-conversation';

import { TelegramChatRepo } from '../repo/repo.js';
import type { TelegramPluginOptions } from '../exports.js';

import { TelegramBotService } from './service.bot.js';

type MessageMeta = {
  chatType: string;
  title?: string;
  username?: string;
  firstName?: string;
};

class TelegramMessageHandler {
  #services: Services;
  #options: TelegramPluginOptions;
  #completions: Map<string, string>;
  #queues = new Map<string, Promise<void>>();

  constructor(services: Services, options: TelegramPluginOptions, completions: Map<string, string>) {
    this.#options = options;
    this.#services = services;
    this.#completions = completions;
  }

  #enqueue = (chatId: string, fn: () => Promise<void>) => {
    const prev = this.#queues.get(chatId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.#queues.set(chatId, next);
  };

  #getOrCreateConversation = async (userId: string) => {
    const conversationService = this.#services.get(ConversationService);
    const active = await conversationService.getActive(userId);
    if (active) {
      return active;
    }
    const conversation = await conversationService.create({ id: randomUUID(), userId });
    await conversationService.setActive(conversation.id, userId);
    return conversation;
  };

  #handleNew = async (telegramChatId: string, userId: string) => {
    const conversationService = this.#services.get(ConversationService);
    const conversation = await conversationService.create({ id: randomUUID(), userId });
    await conversationService.setActive(conversation.id, userId);

    const botService = this.#services.get(TelegramBotService);
    await botService.sendMessage(telegramChatId, 'New conversation started.');
  };

  #processMessage = async (chatId: string, text: string, meta: MessageMeta) => {
    const { users } = this.#options;
    const user = users?.find((user) => user.chatId === chatId);
    if (!user) {
      throw new Error('Telegram user not found');
    }
    const repo = new TelegramChatRepo(this.#services);

    await repo.upsert({
      id: chatId,
      telegramChatId: chatId,
      chatType: meta.chatType as 'private' | 'group' | 'supergroup' | 'channel',
      title: meta.title ?? null,
      username: meta.username ?? null,
      firstName: meta.firstName ?? null,
      model: null,
    });

    const chat = await repo.get(chatId);
    const model = chat?.model;

    const conversation = await this.#getOrCreateConversation(user.userId);

    const completion = await conversation.prompt({
      input: text,
      model: model || undefined,
      state: {
        telegram: {
          chat: {
            id: chatId,
            telegramChatId: chatId,
            chatType: meta.chatType,
            title: meta.title,
            username: meta.username,
          },
        },
      },
    });

    this.#completions.set(completion.id, chatId);

    try {
      await completion.run();
    } catch (error) {
      console.error('[Telegram] Error running completion:', error);
      this.#completions.delete(completion.id);
      try {
        const botService = this.#services.get(TelegramBotService);
        await botService.sendMessage(chatId, 'Sorry, something went wrong.');
      } catch (sendError) {
        console.error('[Telegram] Error sending error message:', sendError);
      }
    }
  };

  public handle = (telegramChatId: string, text: string, meta: MessageMeta) => {
    this.#enqueue(telegramChatId, async () => {
      try {
        if (text.trim() === '/new') {
          const { users } = this.#options;
          const user = users?.find((user) => user.chatId === telegramChatId);
          if (!user) {
            throw new Error('Telegram user not found');
          }
          await this.#handleNew(telegramChatId, user.userId);
          return;
        }
        await this.#processMessage(telegramChatId, text, meta);
      } catch (error) {
        console.error('[Telegram] Error processing message:', error);
        try {
          const botService = this.#services.get(TelegramBotService);
          await botService.sendMessage(telegramChatId, 'Sorry, something went wrong.');
        } catch (sendError) {
          console.error('[Telegram] Error sending error message:', sendError);
        }
      }
    });
  };
}

export { TelegramMessageHandler };
