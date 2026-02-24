import type { Services, State, Tool } from '@morten-olsen/agentic-core';
import { CompletionService, createTool } from '@morten-olsen/agentic-core';
import type { ZodType } from 'zod';
import { z } from 'zod';

import { toCamelCase } from '../mode/mode.prompt.js';
import { runCodeInput } from '../schemas/schemas.js';
import { InterpreterService } from '../service/service.js';

const baseDescription = [
  'Run JavaScript in a sandboxed QuickJS environment.',
  'All functions are transparently async (do NOT use await/async keywords).',
  'The last expression is the return value.',
  'Globals: `input` (the provided input object).',
  'No `fetch`, `require`, `process`, `fs`, or browser/Node APIs unless explicitly listed as available.',
  'Use `import`/`export` only for registered modules.',
].join(' ');

type CreateRunCodeToolOptions = {
  interpreterService: InterpreterService;
  tools: Tool<ZodType, ZodType>[];
  userId: string;
  state: State;
  services: Services;
};

const createRunCodeTool = (options: CreateRunCodeToolOptions) => {
  const { interpreterService, tools, userId, state, services } = options;

  const methods = interpreterService.methodDocs;
  const modules = interpreterService.moduleNames;

  // Build a static description. Note: tools array may grow after this,
  // but the description will mention that more tools may be available.
  const parts = [baseDescription];

  if (methods.length > 0) {
    parts.push(`Available functions: ${methods.map((m) => `\`${m.name}\`: ${m.description}`).join('; ')}.`);
  }

  parts.push(
    'Tool functions: All conversation tools are available as camelCase functions (use `discoverTools()` to list them).',
  );
  parts.push(
    'Utilities: `parallel([{tool, input}])` for concurrent tool calls (tool is the tool ID like "weather.get-weather"), `llm(prompt)` for text completion, `llmJson(prompt)` for JSON completion, `log(...args)` for debug output.',
  );

  if (modules.length > 0) {
    parts.push(`Available modules: ${modules.map((m) => `\`${m}\``).join(', ')}.`);
  }

  return createTool({
    id: 'interpreter.run-code',
    description: parts.join(' '),
    input: runCodeInput,
    output: z.unknown(),
    invoke: async ({ input }) => {
      // Get current tools at invocation time (the array may have grown since tool creation)
      const currentTools = tools.filter((t) => t.id !== 'interpreter.run-code');

      // Clone the interpreter to get plugin-registered functions
      const interpreter = services.get(InterpreterService).clone();
      const store = new Map<string, unknown>();
      const logs: string[] = [];

      interpreter.expose({
        name: 'log',
        description: 'Log debug output',
        fn: (...args: unknown[]) => {
          logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
        },
      });

      interpreter.expose({
        name: 'store',
        description: 'Store a value by key',
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
        name: 'discoverTools',
        description: 'List available tool functions',
        fn: () =>
          currentTools.map((t) => ({
            id: t.id,
            name: toCamelCase(t.id),
            description: t.description,
          })),
      });

      interpreter.expose({
        name: 'toolSchema',
        description: 'Get JSON Schema for a tool input by tool ID',
        fn: (toolId: unknown) => {
          const tool = currentTools.find((t) => t.id === toolId);
          if (!tool) return { error: `Tool "${String(toolId)}" not found` };
          return tool.input.toJSONSchema();
        },
      });

      interpreter.expose({
        name: 'parallel',
        description: 'Execute multiple tool calls in parallel',
        fn: async (calls: unknown) => {
          if (!Array.isArray(calls)) {
            throw new Error('parallel() expects an array of {tool, input} objects');
          }
          const results = await Promise.all(
            calls.map(async (call: unknown) => {
              const { tool: toolId, input: toolInput } = call as { tool: string; input: unknown };
              const tool = currentTools.find((t) => t.id === toolId);
              if (!tool) {
                return { error: `Tool "${toolId}" not found` };
              }
              try {
                const parsed = tool.input.parse(toolInput);
                return await tool.invoke({
                  input: parsed,
                  userId,
                  state,
                  services,
                  secrets: services.secrets,
                  addFileOutput: () => undefined,
                });
              } catch (error) {
                return { error: error instanceof Error ? error.message : String(error) };
              }
            }),
          );
          return results;
        },
      });

      interpreter.expose({
        name: 'llm',
        description: 'Call the LLM with a text prompt',
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
        description: 'Call the LLM and get JSON response',
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

      // Expose each conversation tool as a camelCase function
      for (const tool of currentTools) {
        const fnName = toCamelCase(tool.id);
        interpreter.expose({
          name: fnName,
          description: tool.description,
          fn: async (toolInput: unknown) => {
            const parsed = tool.input.parse(toolInput);
            return await tool.invoke({
              input: parsed,
              userId,
              state,
              services,
              secrets: services.secrets,
              addFileOutput: () => undefined,
            });
          },
        });
      }

      try {
        const result = await interpreter.execute(input);
        if (logs.length > 0) {
          return { result, logs };
        }
        return result;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          logs: logs.length > 0 ? logs : undefined,
        };
      }
    },
  });
};

export { createRunCodeTool };
export type { CreateRunCodeToolOptions };
