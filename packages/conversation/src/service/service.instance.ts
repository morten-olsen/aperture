import {
  type Prompt,
  type Services,
  type PromptCompletionInput,
  CompletionService,
  PromptService,
  EventService,
  promptCompletedEvent,
} from '@morten-olsen/agentic-core';
import { PromptStoreService } from '@morten-olsen/agentic-database';

import { conversationUpdatedEvent } from '../events/events.js';
import type { ConversationRepo } from '../repo/repo.js';

type ConversationInstanceOptions = {
  services: Services;
  id: string;
  userId: string;
  repo: ConversationRepo;
  title?: string | null;
  state?: Record<string, unknown>;
  history?: Prompt[];
};

class ConversationInstance {
  #options: ConversationInstanceOptions;
  #prompts: Prompt[];
  #state?: Record<string, unknown>;
  #title: string | null;

  constructor(options: ConversationInstanceOptions) {
    this.#options = options;
    this.#prompts = options.history || [];
    this.#state = options.state;
    this.#title = options.title ?? null;
  }

  public get id() {
    return this.#options.id;
  }

  public get userId() {
    return this.#options.userId ?? 'admin';
  }

  public get title() {
    return this.#title;
  }

  public get prompts() {
    return this.#prompts;
  }

  #generateTitle = async (userMessage: string) => {
    const { services } = this.#options;
    const completionService = services.get(CompletionService);
    return completionService.complete({
      systemPrompt:
        'Generate a short title (3-6 words) for a conversation that starts with the following message. Reply with only the title, no quotes or punctuation.',
      userMessage: userMessage.slice(0, 500),
      maxTokens: 30,
    });
  };

  public prompt = async (input: Omit<PromptCompletionInput, 'userId'>) => {
    const { services, repo } = this.#options;
    const userId = this.userId;

    await repo.ensureUser(userId);
    await repo.upsert(this.id, userId, this.#state);

    const isFirstPrompt = this.#prompts.length === 0 && this.#title === null;

    const promptService = services.get(PromptService);
    const promptCompletion = promptService.create({
      ...input,
      userId,
      history: [...this.#prompts],
      state: { ...this.#state, ...input.state },
    });

    this.#prompts.push(promptCompletion.prompt);
    await repo.addPrompt(this.id, promptCompletion.id);

    const abortController = new AbortController();
    const eventService = services.get(EventService);
    eventService.listen(
      promptCompletedEvent,
      async (data) => {
        if (data.promptId !== promptCompletion.id) return;
        abortController.abort();
        this.#state = promptCompletion.state.toRecord();
        await repo.updateState(this.id, this.#state);

        if (isFirstPrompt && input.input) {
          try {
            const title = await this.#generateTitle(input.input);
            if (title) {
              this.#title = title;
              await repo.updateTitle(this.id, title);
              eventService.publish(conversationUpdatedEvent, { conversationId: this.id, title }, { userId });
            }
          } catch {
            // Title generation is best-effort; don't break the conversation
          }
        }
      },
      { abortSignal: abortController.signal },
    );

    return promptCompletion;
  };

  public insertPrompt = async (prompt: Prompt) => {
    const { services, repo } = this.#options;
    const promptStore = services.get(PromptStoreService);
    promptStore.insert(prompt);
    await repo.ensureUser(prompt.userId);
    await repo.addPrompt(this.id, prompt.id);
  };
}

export type { ConversationInstanceOptions };
export { ConversationInstance };
