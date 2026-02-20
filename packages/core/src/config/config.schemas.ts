import { z } from 'zod';

import type { FileSystemProvider } from '../filesystem/filesystem.types.js';
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
  fileSystem?: FileSystemProvider;
};

export type { Config };
export { configSchema };
