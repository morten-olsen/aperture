import type { Secret } from './secrets.schema.js';
import type { SecretsProvider } from './secrets.types.js';

class SecretsProviderMemory implements SecretsProvider {
  #secrets: Record<string, Secret & { value: string }>;

  constructor() {
    this.#secrets = {};
  }

  public list = async (): Promise<Secret[]> => {
    return Object.values(this.#secrets).map((secret) => ({
      ...secret,
      value: undefined,
    }));
  };

  public get = async (id: string) => {
    const secret = this.#secrets[id];
    return secret?.value;
  };

  public remove = async (id: string) => {
    // eslint-disable-next-line
    delete this.#secrets[id];
  };

  public set = async (secret: Secret, value: string) => {
    this.#secrets[secret.id] = {
      ...secret,
      value,
    };
  };
}

export { SecretsProviderMemory };
