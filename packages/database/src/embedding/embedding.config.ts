type EmbeddingProvider = 'openai' | 'local';

class EmbeddingConfig {
  #provider: EmbeddingProvider = 'openai';
  #model = 'text-embedding-3-small';
  #dimensions = 1536;

  public get provider() {
    return this.#provider;
  }

  public set provider(value: EmbeddingProvider) {
    this.#provider = value;
  }

  public get model() {
    return this.#model;
  }

  public set model(value: string) {
    this.#model = value;
  }

  public get dimensions() {
    return this.#dimensions;
  }

  public set dimensions(value: number) {
    this.#dimensions = value;
  }
}

export { EmbeddingConfig };
export type { EmbeddingProvider };
