import type { FastifyInstance } from 'fastify';
import { PromptService } from '@morten-olsen/agentic-core';
import { ConversationService } from '@morten-olsen/agentic-conversation';

import type { ApiService } from '../service/service.js';

const registerPromptRoutes = (app: FastifyInstance, apiService: ApiService) => {
  app.post<{ Body: { input: string; model?: 'normal' | 'high'; conversationId?: string } }>(
    '/prompt',
    async (request) => {
      const userId = request.headers['x-user-id'] as string;
      const { input, model, conversationId } = request.body as {
        input: string;
        model?: 'normal' | 'high';
        conversationId?: string;
      };

      let completion;

      if (conversationId) {
        const conversationService = apiService.services.get(ConversationService);
        const conversation = await conversationService.get(conversationId, userId);
        completion = await conversation.prompt({ input, model });
      } else {
        const promptService = apiService.services.get(PromptService);
        completion = promptService.create({ userId, input, model });
      }

      const promptId = completion.id;
      let lastOutputLength = 0;

      completion.on('updated', () => {
        const output = completion.output;
        for (let i = lastOutputLength; i < output.length; i++) {
          apiService.broadcastToUser(userId, 'prompt.output', { promptId, ...output[i] });
        }
        lastOutputLength = output.length;
      });

      completion.on('approval-requested', (_comp, event) => {
        apiService.broadcastToUser(userId, 'prompt.approval', { promptId, ...event });
      });

      completion.on('completed', () => {
        apiService.broadcastToUser(userId, 'prompt.completed', {
          promptId,
          usage: completion.usage,
        });
      });

      completion.run().catch((error: unknown) => {
        apiService.broadcastToUser(userId, 'prompt.error', {
          promptId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return { promptId };
    },
  );

  app.post<{ Params: { promptId: string }; Body: { toolCallId: string } }>(
    '/prompts/:promptId/approve',
    async (request, reply) => {
      const { promptId } = request.params;
      const { toolCallId } = request.body as { toolCallId: string };
      const promptService = apiService.services.get(PromptService);
      const completion = promptService.getActive(promptId);

      if (!completion) {
        return reply.status(404).send({ error: `Prompt "${promptId}" not found or no longer active` });
      }

      await completion.approve(toolCallId);
      return { approved: true };
    },
  );

  app.post<{ Params: { promptId: string }; Body: { toolCallId: string; reason?: string } }>(
    '/prompts/:promptId/reject',
    async (request, reply) => {
      const { promptId } = request.params;
      const { toolCallId, reason } = request.body as { toolCallId: string; reason?: string };
      const promptService = apiService.services.get(PromptService);
      const completion = promptService.getActive(promptId);

      if (!completion) {
        return reply.status(404).send({ error: `Prompt "${promptId}" not found or no longer active` });
      }

      await completion.reject(toolCallId, reason);
      return { rejected: true };
    },
  );
};

export { registerPromptRoutes };
