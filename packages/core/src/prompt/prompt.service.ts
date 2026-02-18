import { EventEmitter } from '../utils/utils.event-emitter.js';
import type { Services } from '../utils/utils.service.js';

import { PromptCompletion, type PromptCompletionOptions, type ApprovalRequestedEvent } from './prompt.completion.js';

type PromptCompletionInput = Omit<PromptCompletionOptions, 'services'>;

type PromptServiceEvents = {
  created: (completion: PromptCompletion) => void;
  'approval-requested': (completion: PromptCompletion, request: ApprovalRequestedEvent) => void;
};

class PromptService extends EventEmitter<PromptServiceEvents> {
  #services: Services;
  #active = new Map<string, PromptCompletion>();

  constructor(services: Services) {
    super();
    this.#services = services;
  }

  #wire = (completion: PromptCompletion) => {
    completion.on('approval-requested', (comp, request) => {
      this.emit('approval-requested', comp, request);
    });
    completion.on('completed', () => {
      this.#active.delete(completion.id);
    });
    this.#active.set(completion.id, completion);
  };

  public create = (options: PromptCompletionInput) => {
    const completion = new PromptCompletion({
      ...options,
      services: this.#services,
    });

    this.#wire(completion);
    this.emit('created', completion);
    return completion;
  };

  public register = (completion: PromptCompletion) => {
    this.#wire(completion);
  };

  public getActive = (promptId: string): PromptCompletion | undefined => {
    return this.#active.get(promptId);
  };
}

export type { PromptCompletionInput };
export { PromptService };
