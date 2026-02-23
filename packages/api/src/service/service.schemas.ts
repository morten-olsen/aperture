import { z } from 'zod';

const apiCorsConfigSchema = z.object({
  origin: z.union([z.string(), z.array(z.string())]),
});

type ApiCorsConfig = z.infer<typeof apiCorsConfigSchema>;

const apiStartOptionsSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
  cors: apiCorsConfigSchema.optional(),
  prefix: z.string().default('/api'),
});

type ApiStartOptions = z.infer<typeof apiStartOptionsSchema>;

export type { ApiCorsConfig, ApiStartOptions };
export { apiCorsConfigSchema, apiStartOptionsSchema };
