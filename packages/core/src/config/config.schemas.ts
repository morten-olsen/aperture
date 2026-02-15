import { z } from 'zod';

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

type Config = z.input<typeof configSchema>;

export type { Config };
export { configSchema };
