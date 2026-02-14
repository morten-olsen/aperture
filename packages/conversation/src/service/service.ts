import { randomUUID } from 'node:crypto';

import type { Services } from '@morten-olsen/agentic-core';

import { ConversationInstance } from './service.instance.js';
import type { ConversationCreateInput } from './service.schemas.js';

class ConversationService {
  #services: Services;
  #conversations: Record<string, ConversationInstance>;

  constructor(services: Services) {
    this.#services = services;
    this.#conversations = {};
  }

  public get = async (id: string) => {
    if (!this.#conversations[id]) {
      this.#conversations[id] = new ConversationInstance({
        id,
        services: this.#services,
      });
    }
    return this.#conversations[id];
  };

  public create = async (input: ConversationCreateInput) => {
    const { id = randomUUID(), history, state } = input;
    const conversation = new ConversationInstance({
      id,
      services: this.#services,
      history,
      state,
    });
    this.#conversations[id] = conversation;
    return conversation;
  };
}

export * from './service.instance.js';
export { ConversationService };
