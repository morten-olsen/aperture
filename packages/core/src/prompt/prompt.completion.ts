import { randomUUID } from 'node:crypto';

import OpenAI from 'openai';

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

  public run = async () => {
    const { model, services } = this.#options;

    while (this.#prompt.state === 'running') {
      const { prompts, context, tools, state } = await this.#prepare();
      const messages: OpenAI.Responses.ResponseInput = [...contextToMessages(context), ...promptsToMessages(prompts)];

      const openAiTools: OpenAI.Responses.Tool[] = tools.map((tool) => ({
        type: 'function',
        name: tool.id,
        description: tool.description,
        strict: true,
        parameters: tool.input.toJSONSchema(),
      }));

      const response = await this.#client.responses.create({
        input: messages,
        tools: openAiTools,
        model,
      });

      const toolCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
      );

      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const tool = tools.find((t) => t.id === toolCall.name);
          if (!tool) {
            console.error(`Tool ${toolCall.name} not found`);
            continue;
          }

          console.log(toolCall.arguments);
          const args = tool.input.parse(JSON.parse(toolCall.arguments));
          const result = await tool.invoke({
            input: args,
            state,
            services,
          });

          const toolOutput: PromptOutputTool = {
            id: toolCall.call_id,
            type: 'tool',
            function: toolCall.name,
            input: args,
            result: { type: 'success', output: result },
            start: new Date().toISOString(),
            end: new Date().toISOString(),
          };

          this.#prompt.output.push(toolOutput);

          messages.push({
            type: 'function_call',
            call_id: toolCall.call_id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          });

          messages.push({
            type: 'function_call_output',
            call_id: toolCall.call_id,
            output: JSON.stringify(result),
          });
        }
      } else {
        const text = response.output_text;
        const textOutput: PromptOutputText = {
          type: 'text',
          content: text,
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        };

        this.#prompt.output.push(textOutput);
        this.#prompt.state = 'completed';
      }
      this.emit('updated', this);
    }

    this.emit('updated', this);
    this.emit('completed', this);
    return this.#prompt;
  };
}

export type { PromptCompletionOptions, PromptCompletionEvents };
export { PromptCompletion };
