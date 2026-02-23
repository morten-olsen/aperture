import { randomUUID } from 'node:crypto';

import type { Prompt, Services } from '@morten-olsen/agentic-core';
import { PromptStoreService } from '@morten-olsen/agentic-database';

import { ConversationRepo } from '../repo/repo.js';

import { ConversationInstance } from './service.instance.js';
import type { ConversationCreateInput } from './service.schemas.js';

type CacheEntry = {
  instance: ConversationInstance;
  lastAccess: number;
};

class ConversationService {
  #services: Services;
  #cache: Map<string, CacheEntry>;
  #maxCacheSize = 50;

  constructor(services: Services) {
    this.#services = services;
    this.#cache = new Map();
  }

  #repo = () => this.#services.get(ConversationRepo);

  #touch = (id: string, instance: ConversationInstance) => {
    this.#cache.set(id, { instance, lastAccess: Date.now() });
    this.#evict();
  };

  #evict = () => {
    if (this.#cache.size <= this.#maxCacheSize) {
      return;
    }
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of this.#cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.#cache.delete(oldestKey);
    }
  };

  public get = async (id: string, userId: string) => {
    const cached = this.#cache.get(id);
    if (cached) {
      this.#touch(id, cached.instance);
      return cached.instance;
    }

    const repo = this.#repo();
    const row = await repo.get(id);

    if (row) {
      const promptIds = await repo.getPromptIds(id);
      const promptStore = this.#services.get(PromptStoreService);
      const history = await promptStore.getByIds(promptIds);
      const state = row.state ? JSON.parse(row.state) : undefined;

      const instance = new ConversationInstance({
        id,
        services: this.#services,
        repo,
        userId: row.user_id,
        title: row.title,
        history,
        state,
      });
      this.#touch(id, instance);
      return instance;
    }

    const instance = new ConversationInstance({
      id,
      services: this.#services,
      repo,
      userId,
    });
    this.#touch(id, instance);
    return instance;
  };

  public create = async (input: ConversationCreateInput) => {
    const { id = randomUUID(), userId, history, state } = input;
    const repo = this.#repo();
    const conversation = new ConversationInstance({
      id,
      services: this.#services,
      userId,
      repo,
      history,
      state,
    });
    this.#touch(id, conversation);
    return conversation;
  };

  public list = async (userId: string) => {
    const repo = this.#repo();
    return repo.list(userId);
  };

  public delete = async (id: string) => {
    const repo = this.#repo();
    await repo.delete(id);
    this.#cache.delete(id);
  };

  public getActive = async (userId: string) => {
    const repo = this.#repo();
    const user = await repo.getUser(userId);
    if (!user?.active_conversation_id) {
      return undefined;
    }
    return this.get(user.active_conversation_id, userId);
  };

  public setActive = async (conversationId: string | null, userId: string) => {
    const repo = this.#repo();
    await repo.ensureUser(userId);
    await repo.setActiveConversation(userId, conversationId);
  };

  public insertIntoActive = async (prompt: Prompt) => {
    const current = await this.getActive(prompt.userId);
    await current?.insertPrompt(prompt);
  };
}

export * from './service.instance.js';
export { ConversationService };
