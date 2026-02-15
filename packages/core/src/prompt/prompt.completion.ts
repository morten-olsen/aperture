import { randomUUID } from 'node:crypto';

import OpenAI from 'openai';

import type { Tool } from '../tool/tool.js';
import type { Services } from '../utils/utils.service.js';
import { PluginService, PluginPrepare } from '../plugin/plugin.js';
import { EventEmitter } from '../utils/utils.event-emitter.js';
import { State } from '../state/state.js';

import { contextToMessages, promptsToMessages } from './prompt.utils.js';
import type { Prompt, PromptOutputText, PromptOutputTool } from './prompt.schema.js';

type PromptCompletionOptions = {
  services: Services;
  model: string;
  history?: Prompt[];
  input?: string;
  state?: Record<string, unknown>;
  maxRounds?: number;
};

type PromptCompletionEvents = {
  updated: (completion: PromptCompletion) => void;
  completed: (completion: PromptCompletion) => void;
};

class PromptCompletion extends EventEmitter<PromptCompletionEvents> {
  #options: PromptCompletionOptions;
  #prompt: Prompt;
  #client: OpenAI;
  #state: State;

  constructor(options: PromptCompletionOptions) {
    super();
    this.#options = options;
    this.#prompt = {
      id: randomUUID(),
      state: 'running',
      input: options.input,
      model: options.model,
      output: [],
    };
    this.#state = State.fromInit(options.state || {});
    this.#client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
      baseURL: process.env['OPENAI_BASE_URL'],
    });
  }

  public get prompt() {
    return this.#prompt;
  }

  public get id() {
    return this.#prompt.id;
  }

  public get model() {
    return this.#prompt.model;
  }

  public get input() {
    return this.#prompt.input;
  }

  public get output() {
    return this.#prompt.output;
  }

  public get state() {
    return this.#state;
  }

  #formatToolError = (toolName: string, error: unknown): string => {
    if (error instanceof SyntaxError) {
      return `Invalid JSON in arguments for tool "${toolName}": ${error.message}`;
    }
    if (error instanceof Error) {
      return `Error in tool "${toolName}": ${error.message}`;
    }
    return `Error in tool "${toolName}": ${String(error)}`;
  };

  #prepare = async () => {
    const { services, history = [] } = this.#options;
    const pluginService = services.get(PluginService);
    const prepare = new PluginPrepare({
      context: {
        items: [],
      },
      prompts: [...history, this.#prompt],
      tools: [],
      state: this.#state,
      services,
    });

    for (const plugin of pluginService.toArray()) {
      await plugin.prepare?.(prepare);
    }

    return prepare;
  };

  #callModel = async (prepared: PluginPrepare) => {
    const messages: OpenAI.Responses.ResponseInput = [
      ...contextToMessages(prepared.context),
      ...promptsToMessages(prepared.prompts),
    ];

    const tools: OpenAI.Responses.Tool[] = prepared.tools.map((tool) => ({
      type: 'function',
      name: tool.id,
      description: tool.description,
      strict: true,
      parameters: tool.input.toJSONSchema(),
    }));

    return this.#client.responses.create({
      input: messages,
      tools,
      model: this.#options.model,
    });
  };

  #executeToolCall = async (
    toolCall: OpenAI.Responses.ResponseFunctionToolCall,
    tools: Tool[],
    state: State,
  ): Promise<PromptOutputTool> => {
    const start = new Date().toISOString();
    const tool = tools.find((t) => t.id === toolCall.name);

    if (!tool) {
      const available = tools.map((t) => t.id).join(', ');
      return {
        id: toolCall.call_id,
        type: 'tool',
        function: toolCall.name,
        input: undefined,
        result: {
          type: 'error',
          error: `Tool "${toolCall.name}" not found. Available tools: ${available}`,
        },
        start,
        end: new Date().toISOString(),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.arguments);
    } catch (error) {
      return {
        id: toolCall.call_id,
        type: 'tool',
        function: toolCall.name,
        input: undefined,
        result: { type: 'error', error: this.#formatToolError(toolCall.name, error) },
        start,
        end: new Date().toISOString(),
      };
    }

    try {
      const args = tool.input.parse(parsed);
      const result = await tool.invoke({
        input: args,
        state,
        services: this.#options.services,
      });

      return {
        id: toolCall.call_id,
        type: 'tool',
        function: toolCall.name,
        input: args,
        result: { type: 'success', output: result },
        start,
        end: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[TOOL ERROR]', error);
      return {
        id: toolCall.call_id,
        type: 'tool',
        function: toolCall.name,
        input: parsed,
        result: { type: 'error', error: this.#formatToolError(toolCall.name, error) },
        start,
        end: new Date().toISOString(),
      };
    }
  };

  #completeWithText = (text: string) => {
    const textOutput: PromptOutputText = {
      type: 'text',
      content: text,
      start: new Date().toISOString(),
      end: new Date().toISOString(),
    };

    this.#prompt.output.push(textOutput);
    this.#prompt.state = 'completed';
  };

  public run = async () => {
    const maxRounds = this.#options.maxRounds ?? 25;
    let round = 0;

    while (this.#prompt.state === 'running') {
      round += 1;
      const prepared = await this.#prepare();
      const response = await this.#callModel(prepared);

      const toolCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
      );

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          this.#prompt.output.push(await this.#executeToolCall(toolCall, prepared.tools, prepared.state));
        }
      } else {
        this.#completeWithText(response.output_text);
      }

      this.emit('updated', this);

      if (round >= maxRounds && this.#prompt.state === 'running') {
        this.#completeWithText(`Exceeded maximum number of rounds (${maxRounds}). Stopping.`);
        this.emit('updated', this);
      }
    }

    this.emit('updated', this);
    this.emit('completed', this);
    return this.#prompt;
  };
}

export type { PromptCompletionOptions, PromptCompletionEvents };
export { PromptCompletion };
