import { randomUUID } from 'node:crypto';

import type {
  ChatMessage,
  ExecutorCreateOptions,
  Prompt,
  PromptExecutor,
  PromptOutputText,
  PromptOutputTool,
  PromptUsage,
} from '@morten-olsen/agentic-core';
import {
  CompletionService,
  EventService,
  PluginPrepareContext,
  PluginService,
  State,
  promptOutputEvent,
  promptCompletedEvent,
} from '@morten-olsen/agentic-core';

import { InterpreterService } from '../service/service.js';

import { setupAgentFunctions } from './mode.functions.js';
import { buildSystemPrompt } from './mode.prompt.js';

class CodeExecutor implements PromptExecutor {
  #options: ExecutorCreateOptions;
  #prompt: Prompt;
  #state: State;
  #usage: PromptUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(options: ExecutorCreateOptions) {
    this.#options = options;
    this.#prompt = options.resumePrompt ?? {
      id: randomUUID(),
      userId: options.userId,
      state: 'running',
      input: options.input,
      model: options.model || 'normal',
      mode: 'code',
      output: [],
    };
    this.#state = State.fromInit(options.state || {});
  }

  get prompt() {
    return this.#prompt;
  }

  get id() {
    return this.#prompt.id;
  }

  get userId() {
    return this.#prompt.userId;
  }

  get state() {
    return this.#state;
  }

  get usage() {
    return this.#usage;
  }

  #historyToMessages = (): ChatMessage[] => {
    const messages: ChatMessage[] = [];
    for (const prompt of this.#options.history || []) {
      if (prompt.input) {
        messages.push({ role: 'user', content: prompt.input });
      }
      for (const output of prompt.output) {
        if (output.type === 'text' && output.content) {
          messages.push({ role: 'assistant', content: output.content });
        }
      }
    }
    return messages;
  };

  #publishOutput = (output: PromptOutputText | PromptOutputTool) => {
    const { services } = this.#options;
    const eventService = services.get(EventService);
    this.#prompt.output.push(output);
    eventService.publish(promptOutputEvent, { promptId: this.id, output }, { userId: this.userId });
  };

  #prepare = async () => {
    const { services } = this.#options;
    const userId = this.userId;
    const pluginService = services.get(PluginService);

    const prepareContext = new PluginPrepareContext({
      userId,
      context: { items: [] },
      prompts: [...(this.#options.history || []), this.#prompt],
      tools: [],
      state: this.#state,
      services,
    });

    for (const [, { plugin, config }] of pluginService.toArray()) {
      await plugin.prepare?.(prepareContext.forPlugin(config));
    }

    return prepareContext;
  };

  run = async (): Promise<Prompt> => {
    const { services } = this.#options;
    const maxIterations = this.#options.maxRounds ?? 10;

    const prepared = await this.#prepare();
    const systemPrompt = buildSystemPrompt({ tools: prepared.tools, context: prepared.context });
    const completionService = services.get(CompletionService);

    const store = new Map<string, unknown>();
    const iterationMessages: ChatMessage[] = [];
    const history = this.#historyToMessages();

    if (this.#prompt.input) {
      history.push({ role: 'user', content: this.#prompt.input });
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...history, ...iterationMessages];

      const code = await completionService.completeMessages({ messages });
      if (!code) {
        this.#publishOutput({
          type: 'text',
          content: '(No response from model)',
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        });
        break;
      }

      // Record the code generation as a tool output
      const codeStart = new Date().toISOString();
      const interpreter = new InterpreterService();
      const controls = setupAgentFunctions({
        interpreter,
        tools: prepared.tools,
        userId: this.userId,
        state: prepared.state,
        services,
        store,
        onOutput: (text) => {
          this.#publishOutput({
            type: 'text',
            content: text,
            start: new Date().toISOString(),
            end: new Date().toISOString(),
          });
        },
        onToolCall: (output) => {
          this.#publishOutput(output);
        },
      });

      let result: unknown;
      let error: unknown;
      try {
        result = await interpreter.execute({ code });
      } catch (e) {
        error = e;
      }

      this.#publishOutput({
        type: 'tool',
        id: randomUUID(),
        function: 'code.execute',
        input: { code },
        result: error
          ? { type: 'error', error: error instanceof Error ? error.message : String(error) }
          : { type: 'success', output: result },
        start: codeStart,
        end: new Date().toISOString(),
      });

      if (controls.isDone()) {
        break;
      }

      const logs = controls.logs();
      const parts: string[] = [];
      if (logs.length > 0) {
        parts.push(`Logs:\n${logs.join('\n')}`);
      }
      if (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        parts.push(`Execution error: ${errMsg}`);
      } else if (result !== undefined) {
        parts.push(`Execution result: ${JSON.stringify(result)}`);
      }

      if (parts.length > 0) {
        const feedback = parts.join('\n\n');
        iterationMessages.push({ role: 'user', content: feedback });
      }

      if (iteration === maxIterations - 1) {
        this.#publishOutput({
          type: 'text',
          content: '(Reached maximum iterations without done() being called)',
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        });
      }
    }

    this.#prompt.state = 'completed';
    this.#prompt.usage = this.#usage;

    const eventService = services.get(EventService);
    eventService.publish(
      promptCompletedEvent,
      {
        promptId: this.id,
        output: this.#prompt.output,
        usage: this.#usage,
      },
      { userId: this.userId },
    );

    return this.#prompt;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  approve = async (toolCallId: string): Promise<void> => {};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  reject = async (toolCallId: string, reason?: string): Promise<void> => {};
}

export { CodeExecutor };
