import type { Services } from '../utils/utils.service.js';
import { EventService } from '../event/event.service.js';

import { PromptCompletion, type PromptCompletionOptions } from './prompt.completion.js';
import { allPromptEvents, promptCreatedEvent, promptCompletedEvent } from './prompt.events.js';

type PromptCompletionInput = Omit<PromptCompletionOptions, 'services'>;

class PromptService {
  #services: Services;
  #active = new Map<string, PromptCompletion>();

  constructor(services: Services) {
    this.#services = services;
    const eventService = services.get(EventService);
    eventService.registerEvent(...allPromptEvents);
    eventService.listen(promptCompletedEvent, (data) => {
      this.#active.delete(data.promptId);
    });
  }

  public create = (options: PromptCompletionInput) => {
    const completion = new PromptCompletion({
      ...options,
      services: this.#services,
    });

    this.#active.set(completion.id, completion);
    const eventService = this.#services.get(EventService);
    eventService.publish(
      promptCreatedEvent,
      { promptId: completion.id, userId: completion.userId },
      { userId: completion.userId },
    );
    return completion;
  };

  public register = (completion: PromptCompletion) => {
    this.#active.set(completion.id, completion);
  };

  public getActive = (promptId: string): PromptCompletion | undefined => {
    return this.#active.get(promptId);
  };
}

export type { PromptCompletionInput };
export { PromptService };
