import { Bot } from 'gramio';

import type { TelegramPluginOptions } from '../schemas/schemas.js';

import { stripMarkdown, toTelegramMarkdown } from './service.markdown.js';
import { splitMessage } from './service.split.js';

class TelegramBotService {
  #bot: Bot | undefined;
  #options: TelegramPluginOptions | undefined;

  public get bot() {
    if (!this.#bot) {
      throw new Error('TelegramBotService not started');
    }
    return this.#bot;
  }

  public get options() {
    if (!this.#options) {
      throw new Error('TelegramBotService not started');
    }
    return this.#options;
  }

  public start = (token: string, options: TelegramPluginOptions) => {
    this.#options = options;
    this.#bot = new Bot(token);
    this.#bot.start();
  };

  public stop = () => {
    this.#bot?.stop();
    this.#bot = undefined;
  };

  public sendMessage = async (chatId: string, text: string): Promise<void> => {
    const bot = this.bot;
    const chunks = splitMessage(text);

    for (const chunk of chunks) {
      try {
        const markdown = toTelegramMarkdown(chunk);
        await bot.api.sendMessage({
          chat_id: chatId,
          text: markdown,
          parse_mode: 'MarkdownV2',
        });
      } catch {
        await bot.api.sendMessage({
          chat_id: chatId,
          text: stripMarkdown(chunk),
        });
      }
    }
  };

  public sendMessageWithKeyboard = async (
    chatId: string,
    text: string,
    buttons: { text: string; callback_data: string }[][],
  ): Promise<void> => {
    const bot = this.bot;
    try {
      const markdown = toTelegramMarkdown(text);
      await bot.api.sendMessage({
        chat_id: chatId,
        text: markdown,
        parse_mode: 'MarkdownV2',
        reply_markup: { inline_keyboard: buttons },
      });
    } catch {
      await bot.api.sendMessage({
        chat_id: chatId,
        text: stripMarkdown(text),
        reply_markup: { inline_keyboard: buttons },
      });
    }
  };
}

export { TelegramBotService };
