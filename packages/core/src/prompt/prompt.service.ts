import { EventEmitter } from '../utils/utils.event-emitter.js';
import type { Services } from '../utils/utils.service.js';

import { PromptCompletion, type PromptCompletionOptions } from './prompt.completion.js';

type PromptCompletionInput = Omit<PromptCompletionOptions, 'services'>;

type PromptServiceEvents = {
  created: (completion: PromptCompletion) => void;
};

class PromptService extends EventEmitter<PromptServiceEvents> {
  #services: Services;

  constructor(services: Services) {
    super();
    this.#services = services;
  }

  public create = (options: PromptCompletionInput) => {
    const completion = new PromptCompletion({
      ...options,
      services: this.#services,
    });

    this.emit('created', completion);
    return completion;
  };
}

export type { PromptCompletionInput };
export { PromptService };
