import type { Services } from '../utils/utils.service.js';
import { EventService } from '../event/event.service.js';

import { PromptCompletion } from './prompt.completion.js';
import { allPromptEvents, promptCreatedEvent, promptCompletedEvent } from './prompt.events.js';
import type { ExecutorCreateOptions, PromptExecutor } from './prompt.executor.js';
import { ExecutionModeService } from './prompt.mode.js';

type PromptCompletionInput = Omit<ExecutorCreateOptions, 'services'>;

class PromptService {
  #services: Services;
  #active = new Map<string, PromptExecutor>();

  constructor(services: Services) {
    this.#services = services;
    const eventService = services.get(EventService);
    eventService.registerEvent(...allPromptEvents);
    eventService.listen(promptCompletedEvent, (data) => {
      this.#active.delete(data.promptId);
    });

    const modeService = services.get(ExecutionModeService);
    modeService.register({
      id: 'classic',
      name: 'Classic (text + tools)',
      createExecutor: (options) => new PromptCompletion(options),
    });
  }

  public create = (options: PromptCompletionInput): PromptExecutor => {
    const modeId = options.mode || 'classic';
    const modeService = this.#services.get(ExecutionModeService);
    const mode = modeService.get(modeId);

    if (!mode) {
      throw new Error(`Unknown execution mode: "${modeId}"`);
    }

    const executor = mode.createExecutor({
      ...options,
      services: this.#services,
    });

    this.#active.set(executor.id, executor);
    const eventService = this.#services.get(EventService);
    eventService.publish(
      promptCreatedEvent,
      { promptId: executor.id, userId: executor.userId },
      { userId: executor.userId },
    );
    return executor;
  };

  public register = (executor: PromptExecutor) => {
    this.#active.set(executor.id, executor);
  };

  public getActive = (promptId: string): PromptExecutor | undefined => {
    return this.#active.get(promptId);
  };
}

export type { PromptCompletionInput };
export { PromptService };
