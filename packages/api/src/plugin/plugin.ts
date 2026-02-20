import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { ApiService } from '../service/service.js';

const apiPluginConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
  cors: z
    .object({
      origin: z.union([z.string(), z.array(z.string())]),
    })
    .optional(),
  prefix: z.string().default('/api'),
});

type ApiPluginConfig = z.infer<typeof apiPluginConfigSchema>;

const apiPlugin = createPlugin({
  id: 'api',
  name: 'API',
  description: 'Fastify-based REST API with tool exposure, SSE prompt streaming, and OpenAPI docs',
  config: apiPluginConfigSchema,
  state: z.unknown(),
  setup: async ({ services }) => {
    services.get(ApiService);
  },
  ready: async ({ services, config }) => {
    const apiService = services.get(ApiService);
    await apiService.start({
      port: config.port,
      host: config.host,
      cors: config.cors,
      prefix: config.prefix,
    });
  },
});

export type { ApiPluginConfig };
export { apiPlugin, apiPluginConfigSchema };
