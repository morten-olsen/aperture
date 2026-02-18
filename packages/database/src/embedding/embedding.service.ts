import type { Services } from '@morten-olsen/agentic-core';

import { EmbeddingConfig } from './embedding.config.js';
import { createLocalEmbeddingProvider } from './embedding.local.js';
import { createOpenAIEmbeddingProvider } from './embedding.openai.js';

type EmbeddingProviderInstance = {
  embed: (texts: string[]) => Promise<number[][]>;
};

class EmbeddingService {
  #services: Services;
  #provider?: EmbeddingProviderInstance;

  constructor(services: Services) {
    this.#services = services;
  }

  #getProvider = (): EmbeddingProviderInstance => {
    if (!this.#provider) {
      const config = this.#services.get(EmbeddingConfig);
      this.#provider =
        config.provider === 'local'
          ? createLocalEmbeddingProvider(this.#services)
          : createOpenAIEmbeddingProvider(this.#services);
    }
    return this.#provider;
  };

  public get dimensions(): number {
    return this.#services.get(EmbeddingConfig).dimensions;
  }

  public embed = async (texts: string[]): Promise<number[][]> => {
    const provider = this.#getProvider();
    return provider.embed(texts);
  };
}

export { EmbeddingService };
