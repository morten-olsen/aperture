import type { Secret } from './secrets.schema.js';

type SecretUpdate = {
  name?: string;
  description?: string;
  value?: string;
};

type SecretsProvider = {
  list: (userId: string) => Promise<Secret[]>;
  set: (userId: string, secret: Secret, value: string) => Promise<void>;
  get: (userId: string, id: string) => Promise<string | undefined>;
  update: (userId: string, id: string, changes: SecretUpdate) => Promise<void>;
  remove: (userId: string, id: string) => Promise<void>;
};

export type { SecretsProvider, SecretUpdate };
