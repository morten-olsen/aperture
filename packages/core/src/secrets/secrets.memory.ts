import type { Secret } from './secrets.schema.js';
import type { SecretsProvider, SecretUpdate } from './secrets.types.js';

class SecretsProviderMemory implements SecretsProvider {
  #secrets: Record<string, Secret & { value: string }>;

  constructor() {
    this.#secrets = {};
  }

  public list = async (userId: string): Promise<Secret[]> => {
    return (
      Object.values(this.#secrets)
        .filter((secret) => secret.userId === userId)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ value: _value, ...secret }) => secret)
    );
  };

  public get = async (userId: string, id: string) => {
    const key = `${userId}:${id}`;
    const secret = this.#secrets[key];
    return secret?.value;
  };

  public remove = async (userId: string, id: string) => {
    const key = `${userId}:${id}`;
    // eslint-disable-next-line
    delete this.#secrets[key];
  };

  public set = async (userId: string, secret: Secret, value: string) => {
    const key = `${userId}:${secret.id}`;
    this.#secrets[key] = {
      ...secret,
      value,
    };
  };

  public update = async (userId: string, id: string, changes: SecretUpdate) => {
    const key = `${userId}:${id}`;
    const existing = this.#secrets[key];
    if (!existing) {
      throw new Error(`Secret ${id} not found`);
    }
    this.#secrets[key] = {
      ...existing,
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.description !== undefined && { description: changes.description }),
      ...(changes.value !== undefined && { value: changes.value }),
      updatedAt: new Date().toISOString(),
    };
  };
}

export { SecretsProviderMemory };
