import type { FastifyInstance } from 'fastify';

import type { ApiService } from '../service/service.js';

const registerEventsRoutes = (app: FastifyInstance, apiService: ApiService) => {
  app.get('/events', async () => {
    const events = apiService.eventService.getEvents().map((event) => ({
      id: event.id,
      schema: event.schema.toJSONSchema(),
    }));
    return { events };
  });

  app.get('/events/stream', async (request, reply) => {
    const userId = request.headers['x-user-id'] as string;

    const origin = request.headers.origin;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin && {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      }),
    });

    await reply.hijack();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', { userId });

    const cleanup = apiService.registerConnection(userId, { send });

    const keepaliveInterval = setInterval(() => {
      reply.raw.write(':keepalive\n\n');
    }, 30_000);

    request.raw.on('close', () => {
      clearInterval(keepaliveInterval);
      cleanup();
    });
  });
};

export { registerEventsRoutes };
