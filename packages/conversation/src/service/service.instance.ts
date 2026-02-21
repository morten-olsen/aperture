import {
  type Prompt,
  type Services,
  type PromptCompletionInput,
  PromptService,
  EventService,
  promptCompletedEvent,
} from '@morten-olsen/agentic-core';
import { PromptStoreService } from '@morten-olsen/agentic-database';

import type { ConversationRepo } from '../repo/repo.js';

type ConversationInstanceOptions = {
  services: Services;
  id: string;
  userId: string;
  repo: ConversationRepo;
  state?: Record<string, unknown>;
  history?: Prompt[];
};

class ConversationInstance {
  #options: ConversationInstanceOptions;
  #prompts: Prompt[];
  #state?: Record<string, unknown>;

  constructor(options: ConversationInstanceOptions) {
    this.#options = options;
    this.#prompts = options.history || [];
    this.#state = options.state;
  }

  public get id() {
    return this.#options.id;
  }

  public get userId() {
    return this.#options.userId ?? 'admin';
  }

  public get prompts() {
    return this.#prompts;
  }

  public prompt = async (input: Omit<PromptCompletionInput, 'userId'>) => {
    const { services, repo } = this.#options;
    const userId = this.userId;

    await repo.ensureUser(userId);
    await repo.upsert(this.id, userId, this.#state);

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
