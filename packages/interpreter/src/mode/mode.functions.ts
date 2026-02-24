import { randomUUID } from 'node:crypto';

import type { PromptOutputTool, Services, State, Tool } from '@morten-olsen/agentic-core';
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

  for (const tool of tools) {
    const fnName = toCamelCase(tool.id);
    interpreter.expose({
      name: fnName,
      description: tool.description,
      fn: async (input: unknown) => {
        const start = new Date().toISOString();
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
