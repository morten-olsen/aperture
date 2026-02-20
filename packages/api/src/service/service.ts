import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Tool, Services } from '@morten-olsen/agentic-core';

import type { ApiStartOptions, ToolExposureOptions } from './service.schemas.js';

type SseConnection = {
  send: (event: string, data: unknown) => void;
};

type ExposedTool = {
  tool: Tool;
  tag?: string;
};

class ApiService {
  #services: Services;
  #tools: Map<string, ExposedTool>;
  #fastify: FastifyInstance | null;
  #connections: Map<string, Set<SseConnection>>;

  constructor(services: Services) {
    this.#services = services;
    this.#tools = new Map();
    this.#fastify = null;
    this.#connections = new Map();
  }

  public get services() {
    return this.#services;
  }

  public get tools() {
    return this.#tools;
  }

  public exposeTool = (tool: Tool, options?: ToolExposureOptions) => {
    this.#tools.set(tool.id, { tool, tag: options?.tag });
  };

  public exposeTools = (tools: Tool[], options?: ToolExposureOptions) => {
    for (const tool of tools) {
      this.exposeTool(tool, options);
    }
  };

  public registerConnection = (userId: string, connection: SseConnection): (() => void) => {
    let set = this.#connections.get(userId);
    if (!set) {
      set = new Set();
      this.#connections.set(userId, set);
    }
    set.add(connection);
    return () => {
      set.delete(connection);
      if (set.size === 0) {
        this.#connections.delete(userId);
      }
    };
  };

  public broadcastToUser = (userId: string, event: string, data: unknown): void => {
    const set = this.#connections.get(userId);
    if (!set) return;
    for (const connection of set) {
      connection.send(event, data);
    }
  };

  public start = async (options: ApiStartOptions) => {
    const { port, host, prefix } = options;

    const fastify = Fastify({ logger: false });
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);

    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'GLaDOS API',
          version: '1.0.0',
        },
      },
    });

    await fastify.register(cors, { origin: true });

    const publicExact = new Set([`${prefix}/capabilities`, `${prefix}/tools`, `${prefix}/openapi.json`]);
    const publicPrefixes = [`${prefix}/docs`];
    fastify.addHook('onRequest', async (request, reply) => {
      const url = request.url.split('?')[0];
      if (publicExact.has(url)) return;
      if (publicPrefixes.some((p) => url === p || url.startsWith(`${p}/`))) return;
      const userId = request.headers['x-user-id'];
      if (!userId || typeof userId !== 'string') {
        await reply.status(401).send({ error: 'Missing X-User-Id header' });
      }
    });

    const { registerCapabilitiesRoutes } = await import('../routes/routes.capabilities.js');
    const { registerToolRoutes } = await import('../routes/routes.tools.js');
    const { registerPromptRoutes } = await import('../routes/routes.prompt.js');
    const { registerEventsRoutes } = await import('../routes/routes.events.js');

    await fastify.register(
      async (app) => {
        registerCapabilitiesRoutes(app, this);
        registerToolRoutes(app, this);
        registerPromptRoutes(app, this);
        registerEventsRoutes(app, this);
      },
      { prefix },
    );

    try {
      const { default: scalarPlugin } = await import('@scalar/fastify-api-reference');
      await fastify.register(scalarPlugin, {
        routePrefix: `${prefix}/docs` as `/${string}`,
      });
    } catch {
      // Scalar is optional — skip if not available
    }

    await fastify.listen({ port, host });
    this.#fastify = fastify;
    console.log(`[glados] API listening on ${host}:${port}`);
  };

  public stop = async () => {
    if (this.#fastify) {
      await this.#fastify.close();
      this.#fastify = null;
    }
  };
}

export type { SseConnection };
export { ApiService };
