import OpenAI from 'openai';

import type { Services } from '../utils/utils.service.js';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type CompletionInput = {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
};

type CompletionMessagesInput = {
  messages: ChatMessage[];
  maxTokens?: number;
  model?: string;
};

class CompletionService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  public complete = async (input: CompletionInput): Promise<string | null> => {
    const { provider, models } = this.#services.config;
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
    });
    const response = await client.chat.completions.create({
      model: models.normal,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userMessage },
      ],
      max_tokens: input.maxTokens,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  };

  public completeMessages = async (input: CompletionMessagesInput): Promise<string | null> => {
    const { provider, models } = this.#services.config;
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
    });
    const response = await client.chat.completions.create({
      model: input.model || models.normal,
      messages: input.messages,
      max_tokens: input.maxTokens,
    });
    return response.choices[0]?.message?.content?.trim() ?? null;
  };
}

export type { CompletionInput, CompletionMessagesInput, ChatMessage };
export { CompletionService };
