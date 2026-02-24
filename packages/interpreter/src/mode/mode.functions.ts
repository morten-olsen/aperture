import { randomUUID } from 'node:crypto';

import type { PromptOutputTool, Services, State, Tool } from '@morten-olsen/agentic-core';
import { CompletionService } from '@morten-olsen/agentic-core';
import type { ZodType } from 'zod';

import type { InterpreterService } from '../service/service.js';

import { toCamelCase } from './mode.prompt.js';

type SetupAgentFunctionsOptions = {
  interpreter: InterpreterService;
  tools: Tool<ZodType, ZodType>[];
  userId: string;
  state: State;
  services: Services;
  store: Map<string, unknown>;
  onOutput: (text: string) => void;
  onToolCall?: (output: PromptOutputTool) => void;
};

type AgentFunctionControls = {
  isDone: () => boolean;
  logs: () => string[];
};

const setupAgentFunctions = (options: SetupAgentFunctionsOptions): AgentFunctionControls => {
  const { interpreter, tools, userId, state, services, store, onOutput, onToolCall } = options;
  let done = false;
  let logs: string[] = [];

  interpreter.expose({
    name: 'output',
    description: 'Send text output to the user',
    fn: (text: unknown) => {
      onOutput(String(text));
    },
  });

  interpreter.expose({
    name: 'done',
    description: 'Signal that you are finished responding',
    fn: () => {
      done = true;
    },
  });

  interpreter.expose({
    name: 'complete',
    description:
      'Structured way to finish: outputs response text, optionally stores data, and calls done(). ' +
      'Takes { response: string, data?: any, followUp?: string }.',
    fn: (opts: unknown) => {
      const { response, data, followUp } = (opts ?? {}) as {
        response?: string;
        data?: unknown;
        followUp?: string;
      };
      if (response) {
        onOutput(response);
      }
      if (followUp) {
        onOutput('\n\n' + followUp);
      }
      if (data !== undefined) {
        store.set('_lastData', data);
      }
      done = true;
      return { stored: data !== undefined, followUp: !!followUp };
    },
  });

  interpreter.expose({
    name: 'discoverTools',
    description: 'List available tool functions with their IDs and descriptions',
    fn: () =>
      tools.map((t) => ({
        id: t.id,
        name: toCamelCase(t.id),
        description: t.description,
      })),
  });

  interpreter.expose({
    name: 'toolSchema',
    description: 'Get JSON Schema for a tool input by tool ID',
    fn: (toolId: unknown) => {
      const tool = tools.find((t) => t.id === toolId);
      if (!tool) return { error: `Tool "${String(toolId)}" not found` };
      return tool.input.toJSONSchema();
    },
  });

  interpreter.expose({
    name: 'store',
    description: 'Store a value by key (persists across iterations)',
    fn: (key: unknown, value: unknown) => {
      store.set(String(key), value);
    },
  });

  interpreter.expose({
    name: 'recall',
    description: 'Recall a stored value by key',
    fn: (key: unknown) => store.get(String(key)) ?? null,
  });

  interpreter.expose({
    name: 'log',
    description: 'Log debug output (visible to you on next iteration)',
    fn: (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    },
  });

  interpreter.expose({
    name: 'parallel',
    description:
      'Execute multiple tool calls in parallel. Takes an array of {tool, input} objects. Returns an array of results (or {error} for failures).',
    fn: async (calls: unknown) => {
      if (!Array.isArray(calls)) {
        throw new Error('parallel() expects an array of {tool, input} objects');
      }
      const results = await Promise.all(
        calls.map(async (call: unknown) => {
          const { tool: toolId, input } = call as { tool: string; input: unknown };
          const tool = tools.find((t) => t.id === toolId);
          if (!tool) {
            return { error: `Tool "${toolId}" not found` };
          }
          const start = new Date().toISOString();
          try {
            const parsed = tool.input.parse(input);
            const result = await tool.invoke({
              input: parsed,
              userId,
              state,
              services,
              secrets: services.secrets,
              addFileOutput: () => undefined,
            });
            if (onToolCall) {
              onToolCall({
                type: 'tool',
                id: randomUUID(),
                function: tool.id,
                input: parsed,
                result: { type: 'success', output: result },
                start,
                end: new Date().toISOString(),
              });
            }
            return result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (onToolCall) {
              onToolCall({
                type: 'tool',
                id: randomUUID(),
                function: tool.id,
                input,
                result: { type: 'error', error: errorMessage },
                start,
                end: new Date().toISOString(),
              });
            }
            return { error: errorMessage };
          }
        }),
      );
      return results;
    },
  });

  interpreter.expose({
    name: 'llm',
    description: 'Call the LLM with a text prompt and get a text response',
    fn: async (prompt: unknown) => {
      const completionService = services.get(CompletionService);
      return await completionService.complete({
        systemPrompt: 'You are a helpful assistant. Respond concisely.',
        userMessage: String(prompt),
      });
    },
  });

  interpreter.expose({
    name: 'llmJson',
    description: 'Call the LLM with a prompt and get a JSON response',
    fn: async (prompt: unknown) => {
      const completionService = services.get(CompletionService);
      const result = await completionService.completeMessages({
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Respond with valid JSON only.' },
          { role: 'user', content: String(prompt) },
        ],
        responseFormat: { type: 'json_object' },
      });
      if (!result) return null;
      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    },
  });

  for (const tool of tools) {
    const fnName = toCamelCase(tool.id);
    interpreter.expose({
      name: fnName,
      description: tool.description,
      fn: async (input: unknown) => {
        const start = new Date().toISOString();
        try {
          const parsed = tool.input.parse(input);
          const result = await tool.invoke({
            input: parsed,
            userId,
            state,
            services,
            secrets: services.secrets,
            addFileOutput: () => undefined,
          });

          if (onToolCall) {
            onToolCall({
              type: 'tool',
              id: randomUUID(),
              function: tool.id,
              input: parsed,
              result: { type: 'success', output: result },
              start,
              end: new Date().toISOString(),
            });
          }

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (onToolCall) {
            onToolCall({
              type: 'tool',
              id: randomUUID(),
              function: tool.id,
              input,
              result: { type: 'error', error: errorMessage },
              start,
              end: new Date().toISOString(),
            });
          }
          throw new Error(`Tool "${tool.id}" failed: ${errorMessage}`);
        }
      },
    });
  }

  return {
    isDone: () => done,
    logs: () => {
      const current = logs;
      logs = [];
      return current;
    },
  };
};

export { setupAgentFunctions };
export type { SetupAgentFunctionsOptions, AgentFunctionControls };
