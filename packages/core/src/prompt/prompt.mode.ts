import type { Services } from '../utils/utils.service.js';

import type { ExecutionModeFactory } from './prompt.executor.js';

class ExecutionModeService {
  #modes = new Map<string, ExecutionModeFactory>();
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  get services() {
    return this.#services;
  }

  register = (mode: ExecutionModeFactory): void => {
    this.#modes.set(mode.id, mode);
  };

  get = (modeId: string): ExecutionModeFactory | undefined => {
    return this.#modes.get(modeId);
  };

  list = (): ExecutionModeFactory[] => {
    return [...this.#modes.values()];
  };
}

export { ExecutionModeService };
