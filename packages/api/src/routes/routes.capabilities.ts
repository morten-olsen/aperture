import type { FastifyInstance } from 'fastify';
import { PluginService } from '@morten-olsen/agentic-core';

import type { ApiService } from '../service/service.js';

const registerCapabilitiesRoutes = (app: FastifyInstance, apiService: ApiService) => {
  app.get('/capabilities', async () => {
    const pluginService = apiService.services.get(PluginService);
    const plugins = pluginService.toArray().map(([id, { plugin }]) => ({
      id,
      name: plugin.name ?? id,
      description: plugin.description,
    }));
    return { plugins };
  });
};

export { registerCapabilitiesRoutes };
