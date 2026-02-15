import { type Prompt, type Services, type PromptCompletionInput, PromptService } from '@morten-olsen/agentic-core';

import type { ConversationRepo } from '../repo/repo.js';

type ConversationInstanceOptions = {
  services: Services;
  id: string;
  userId?: string;
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

  public prompt = async (input: PromptCompletionInput) => {
    const { services, repo } = this.#options;
    const userId = this.userId;

    await repo.ensureUser(userId);
    await repo.upsert(this.id, userId, this.#state);

    const promptService = services.get(PromptService);
    const promptCompletion = promptService.create({
      ...input,
      history: [...this.#prompts],
      state: { ...this.#state, ...input.state },
    });

    this.#prompts.push(promptCompletion.prompt);
    await repo.addPrompt(this.id, promptCompletion.id);

    promptCompletion.on('completed', async () => {
      this.#state = promptCompletion.state.toRecord();
      await repo.updateState(this.id, this.#state);
    });

    return promptCompletion;
  };
}

export type { ConversationInstanceOptions };
export { ConversationInstance };
