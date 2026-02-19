import type { Secret } from './secrets.schema.js';

type SecretsProvider = {
  list: () => Promise<Secret[]>;
  set: (secret: Secret, value: string) => Promise<void>;
  get: (id: string) => Promise<string | undefined>;
  remove: (id: string) => Promise<void>;
};

export type { SecretsProvider };
