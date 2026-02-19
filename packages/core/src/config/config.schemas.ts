import { z } from 'zod';

import type { SecretsProvider } from '../secrets/secrets.types.js';

const configSchema = z.object({
  provider: z.object({
    apiKey: z.string(),
    baseUrl: z.string(),
  }),
  models: z.object({
    normal: z.string(),
    high: z.string().optional(),
  }),
});

type Config = z.input<typeof configSchema> & {
  secrets?: SecretsProvider;
};

export type { Config };
export { configSchema };
