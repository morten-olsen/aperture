import type { FastifyInstance } from 'fastify';
import { State } from '@morten-olsen/agentic-core';

import type { ApiService } from '../service/service.js';

const registerToolRoutes = (app: FastifyInstance, apiService: ApiService) => {
  app.get('/tools', async () => {
    const tools = apiService.toolRegistry.getTools().map((tool) => ({
      id: tool.id,
      description: tool.description,
      input: tool.input.toJSONSchema(),
      output: tool.output.toJSONSchema(),
    }));
    return { tools };
  });

  app.post<{ Params: { toolId: string }; Body: unknown }>('/tools/:toolId/invoke', async (request, reply) => {
    const { toolId } = request.params;
    const userId = request.headers['x-user-id'] as string;
    const tool = apiService.toolRegistry.getTool(toolId);

    if (!tool) {
      return reply.status(404).send({ error: `Tool "${toolId}" not found` });
    }

    const body = typeof request.body === 'object' && request.body !== null ? request.body : {};
    const input = tool.input.parse({ ...body, userId });
    const state = State.fromInit({});

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const addFileOutput = () => {};
    const result = await tool.invoke({
      input,
      userId,
      state,
      services: apiService.services,
      secrets: apiService.services.secrets,
      addFileOutput,
    });

    return { result };
  });
};

export { registerToolRoutes };
