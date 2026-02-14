import { type Prompt, type Services, type PromptCompletionInput, PromptService } from '@morten-olsen/agentic-core';

type ConversationInstanceOptions = {
  services: Services;
  id: string;
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

  public get prompts() {
    return this.#prompts;
  }

  public prompt = async (input: PromptCompletionInput) => {
    const { services } = this.#options;
    const promptService = services.get(PromptService);
    const promptCompletion = promptService.create({
      ...input,
      state: this.#state,
    });
    // TODO: update state on complete
    this.#prompts.push(promptCompletion.prompt);
    return promptCompletion;
  };
}

export { ConversationInstance };
