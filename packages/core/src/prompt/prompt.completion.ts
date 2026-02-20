import { randomUUID } from 'node:crypto';

import OpenAI from 'openai';

import type { ApprovalRequest, Tool } from '../tool/tool.js';
import type { Services } from '../utils/utils.service.js';
import { PluginService, PluginPrepareContext } from '../plugin/plugin.js';
import { EventEmitter } from '../utils/utils.event-emitter.js';
import { State } from '../state/state.js';

import { contextToMessages, promptsToMessages } from './prompt.utils.js';
import type { Prompt, PromptOutputText, PromptOutputTool, PromptUsage } from './prompt.schema.js';

type ApprovalRequestedEvent = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  reason: string;
};

type PromptCompletionOptions = {
  services: Services;
  model?: 'normal' | 'high';
  userId: string;
  history?: Prompt[];
  input?: string;
  state?: Record<string, unknown>;
  maxRounds?: number;
  resumePrompt?: Prompt;
};

type PromptCompletionEvents = {
  updated: (completion: PromptCompletion) => void;
  completed: (completion: PromptCompletion) => void;
  'approval-requested': (completion: PromptCompletion, request: ApprovalRequestedEvent) => void;
};

class PromptCompletion extends EventEmitter<PromptCompletionEvents> {
  #options: PromptCompletionOptions;
  #prompt: Prompt;
  #client: OpenAI;
  #state: State;
  #pendingBatchRemaining: OpenAI.Responses.ResponseFunctionToolCall[] = [];
  #pendingToolCallTools: Tool[] = [];
  #usage: PromptUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(options: PromptCompletionOptions) {
    super();
    this.#options = options;
    this.#prompt = options.resumePrompt ?? {
      id: randomUUID(),
      userId: options.userId,
      state: 'running',
      input: options.input,
      model: options.model || 'normal',
      output: [],
    };
    this.#state = State.fromInit(options.state || {});
    this.#client = new OpenAI({
      apiKey: options.services.config.provider.apiKey,
      baseURL: options.services.config.provider.baseUrl,
    });
  }

  public get prompt() {
    return this.#prompt;
  }

  public get id() {
    return this.#prompt.id;
  }

  public get userId() {
    return this.prompt.userId;
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

  public get usage() {
    return this.#usage;
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
    const { userId, services, history = [] } = this.#options;
    const pluginService = services.get(PluginService);

    const prepareContext = new PluginPrepareContext({
      userId,
      context: { items: [] },
      prompts: [...history, this.#prompt],
      tools: [],
      state: this.#state,
      services,
    });

    for (const [, { plugin, config }] of pluginService.toArray()) {
      await plugin.prepare?.(prepareContext.forPlugin(config));
    }

    return prepareContext;
  };

  #callModel = async (prepared: PluginPrepareContext) => {
    const { services } = this.#options;
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

    const modelName = services.config.models[this.#prompt.model];
    return this.#client.responses.create({
      input: messages,
      tools,
      model: modelName,
    });
  };

  #accumulateUsage = (response: OpenAI.Responses.Response) => {
    const { services } = this.#options;
    if (response.usage) {
      this.#usage.inputTokens += response.usage.input_tokens;
      this.#usage.outputTokens += response.usage.output_tokens;
      this.#usage.totalTokens += response.usage.total_tokens;
      const reasoning = response.usage.output_tokens_details?.reasoning_tokens;
      if (reasoning != null) {
        this.#usage.reasoningTokens = (this.#usage.reasoningTokens ?? 0) + reasoning;
      }
    }
    const usageExt = response.usage as unknown as Record<string, unknown> | undefined;
    if (usageExt && typeof usageExt.cost === 'number') {
      this.#usage.cost = (this.#usage.cost ?? 0) + usageExt.cost;
    }
    if (!this.#usage.resolvedModel) {
      this.#usage.resolvedModel = services.config.models[this.#prompt.model];
    }
  };

  #evaluateApproval = async (tool: Tool, args: unknown, state: State): Promise<ApprovalRequest | undefined> => {
    if (!tool.requireApproval) {
      return undefined;
    }
    if (typeof tool.requireApproval === 'function') {
      return tool.requireApproval({
        input: args,
        userId: this.userId,
        state,
        services: this.#options.services,
        secrets: this.#options.services.secrets,
      });
    }
    return tool.requireApproval;
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

      const approval = await this.#evaluateApproval(tool, args, state);
      if (approval && approval.required) {
        return {
          id: toolCall.call_id,
          type: 'tool',
          function: toolCall.name,
          input: args,
          result: { type: 'pending', reason: approval.reason },
          start,
        };
      }

      const result = await tool.invoke({
        input: args,
        userId: this.userId,
        state,
        services: this.#options.services,
        secrets: this.#options.services.secrets,
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
    this.#prompt.usage = this.#usage;
    this.#prompt.state = 'completed';
  };

  #processToolCalls = async (
    toolCalls: OpenAI.Responses.ResponseFunctionToolCall[],
    tools: Tool[],
    state: State,
  ): Promise<boolean> => {
    for (let i = 0; i < toolCalls.length; i++) {
      const output = await this.#executeToolCall(toolCalls[i], tools, state);
      this.#prompt.output.push(output);

      if (output.result.type === 'pending') {
        this.#pendingBatchRemaining = toolCalls.slice(i + 1);
        this.#pendingToolCallTools = tools;
        this.#prompt.state = 'waiting_for_approval';
        this.emit('updated', this);
        this.emit('approval-requested', this, {
          toolCallId: output.id,
          toolName: output.function,
          input: output.input,
          reason: output.result.reason,
        });
        return true;
      }
    }
    return false;
  };

  #findPendingOutput = (toolCallId: string): PromptOutputTool | undefined => {
    return this.#prompt.output.find(
      (o): o is PromptOutputTool => o.type === 'tool' && o.id === toolCallId && o.result.type === 'pending',
    );
  };

  public approve = async (toolCallId: string) => {
    const pendingOutput = this.#findPendingOutput(toolCallId);
    if (!pendingOutput) return;

    const tool = this.#pendingToolCallTools.find((t) => t.id === pendingOutput.function);
    if (tool) {
      try {
        const result = await tool.invoke({
          input: pendingOutput.input,
          userId: this.userId,
          state: this.#state,
          services: this.#options.services,
          secrets: this.#options.services.secrets,
        });
        pendingOutput.result = { type: 'success', output: result };
      } catch (error) {
        console.error('[TOOL ERROR]', error);
        pendingOutput.result = { type: 'error', error: this.#formatToolError(pendingOutput.function, error) };
      }
    } else {
      pendingOutput.result = { type: 'error', error: `Tool "${pendingOutput.function}" no longer available` };
    }
    pendingOutput.end = new Date().toISOString();

    const remaining = this.#pendingBatchRemaining;
    const tools = this.#pendingToolCallTools;
    this.#pendingBatchRemaining = [];

    if (remaining.length > 0) {
      const paused = await this.#processToolCalls(remaining, tools, this.#state);
      if (paused) return;
    }

    this.#pendingToolCallTools = [];
    this.#prompt.state = 'running';
    await this.run();
  };

  public reject = async (toolCallId: string, reason?: string) => {
    const pendingOutput = this.#findPendingOutput(toolCallId);
    if (!pendingOutput) return;

    pendingOutput.result = { type: 'error', error: reason ?? 'Rejected by user' };
    pendingOutput.end = new Date().toISOString();

    const remaining = this.#pendingBatchRemaining;
    const tools = this.#pendingToolCallTools;
    this.#pendingBatchRemaining = [];

    if (remaining.length > 0) {
      const paused = await this.#processToolCalls(remaining, tools, this.#state);
      if (paused) return;
    }

    this.#pendingToolCallTools = [];
    this.#prompt.state = 'running';
    await this.run();
  };

  public run = async () => {
    const maxRounds = this.#options.maxRounds ?? 25;
    let round = 0;

    while (this.#prompt.state === 'running') {
      round += 1;
      const prepared = await this.#prepare();
      const response = await this.#callModel(prepared);
      this.#accumulateUsage(response);

      const toolCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
      );

      if (toolCalls.length > 0) {
        const paused = await this.#processToolCalls(toolCalls, prepared.tools, prepared.state);
        if (paused) return this.#prompt;
      } else {
        this.#completeWithText(response.output_text);
      }

      this.emit('updated', this);

      if (round >= maxRounds && this.#prompt.state === 'running') {
        this.#completeWithText(`Exceeded maximum number of rounds (${maxRounds}). Stopping.`);
        this.emit('updated', this);
      }
    }

    if (this.#prompt.state === 'completed') {
      this.emit('updated', this);
      this.emit('completed', this);
    }
    return this.#prompt;
  };
}

export type { PromptCompletionOptions, PromptCompletionEvents, ApprovalRequestedEvent };
export { PromptCompletion };
