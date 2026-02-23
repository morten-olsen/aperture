import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ApiService } from '../service/service.js';

const registerSchemaRoutes = (app: FastifyInstance, apiService: ApiService) => {
  app.get('/schema', async () => {
    const tools = z.object(
      Object.fromEntries(
        apiService.toolRegistry.getTools().map((tool) => [
          tool.id,
          z.object({
            input: tool.input,
            output: tool.output,
          }),
        ]),
      ),
    );
    const events = z.object(
      Object.fromEntries(
        apiService.eventService.getEvents().map((event) => [
          event.id,
          z.object({
            schema: event.schema,
          }),
        ]),
      ),
    );
    const schema = z.object({
      tools,
      events,
    });
    return schema.toJSONSchema();
  });
};

export { registerSchemaRoutes };
