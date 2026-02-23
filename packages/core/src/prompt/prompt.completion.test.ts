import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import {
  PromptCompletion,
  Services,
  PluginService,
  EventService,
  createPlugin,
  createTool,
  promptOutputEvent,
  promptCompletedEvent,
  promptApprovalRequestedEvent,
} from '@morten-olsen/agentic-core';

const TEST_BASE_URL = 'https://test.openai.com/v1';
const RESPONSES_URL = `${TEST_BASE_URL}/responses`;

const createTextApiResponse = (text: string) => ({
  id: 'resp_test',
  object: 'response',
  created_at: Math.floor(Date.now() / 1000),
  model: 'test-model',
  status: 'completed',
  output_text: text,
  output: [
    {
      type: 'message',
      id: 'msg_test',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }],
    },
  ],
  error: null,
  incomplete_details: null,
  instructions: null,
  metadata: null,
  parallel_tool_calls: true,
  temperature: 1,
  tool_choice: 'auto',
  top_p: 1,
  max_output_tokens: null,
  previous_response_id: null,
  reasoning: null,
  truncation: 'disabled',
  tools: [],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, output_tokens_details: { reasoning_tokens: 0 } },
  text: { format: { type: 'text' } },
});

const createToolCallApiResponse = (name: string, args: Record<string, unknown>, callId: string) => ({
  id: 'resp_test',
  object: 'response',
  created_at: Math.floor(Date.now() / 1000),
  model: 'test-model',
  status: 'completed',
  output_text: '',
  output: [
    {
      type: 'function_call',
      id: `fc_${callId}`,
      call_id: callId,
      name,
      arguments: JSON.stringify(args),
      status: 'completed',
    },
  ],
  error: null,
  incomplete_details: null,
  instructions: null,
  metadata: null,
  parallel_tool_calls: true,
  temperature: 1,
  tool_choice: 'auto',
  top_p: 1,
  max_output_tokens: null,
  previous_response_id: null,
  reasoning: null,
  truncation: 'disabled',
  tools: [],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, output_tokens_details: { reasoning_tokens: 0 } },
  text: { format: { type: 'text' } },
});

const createMultiToolCallApiResponse = (calls: { name: string; args: Record<string, unknown>; callId: string }[]) => ({
  id: 'resp_test',
  object: 'response',
  created_at: Math.floor(Date.now() / 1000),
  model: 'test-model',
  status: 'completed',
  output_text: '',
  output: calls.map((c) => ({
    type: 'function_call',
    id: `fc_${c.callId}`,
    call_id: c.callId,
    name: c.name,
    arguments: JSON.stringify(c.args),
    status: 'completed',
  })),
  error: null,
  incomplete_details: null,
  instructions: null,
  metadata: null,
  parallel_tool_calls: true,
  temperature: 1,
  tool_choice: 'auto',
  top_p: 1,
  max_output_tokens: null,
  previous_response_id: null,
  reasoning: null,
  truncation: 'disabled',
  tools: [],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, output_tokens_details: { reasoning_tokens: 0 } },
  text: { format: { type: 'text' } },
});

const toSSE = (response: Record<string, unknown>) => {
  const created = `event: response.created\ndata: ${JSON.stringify({ type: 'response.created', response })}\n\n`;
  const completed = `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response })}\n\n`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(created + completed));
      controller.close();
    },
  });
  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('PromptCompletion', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  it('completes with a text response when no tools are called', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return toSSE(createTextApiResponse('Hello, world!'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Say hello',
    });

    const result = await completion.run();

    expect(result.state).toBe('completed');
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toMatchObject({
      type: 'text',
      content: 'Hello, world!',
    });
  });

  it('invokes a tool and then completes with text', async () => {
    const echoTool = createTool({
      id: 'test.echo',
      description: 'Echoes input',
      input: z.object({ message: z.string() }),
      output: z.object({ echoed: z.string() }),
      invoke: async ({ input }) => ({ echoed: input.message }),
    });

    const plugin = createPlugin({
      id: 'test',
      name: 'Test Plugin',
      config: z.unknown(),
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(echoTool);
      },
    });

    await services.get(PluginService).register(plugin, undefined);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('test.echo', { message: 'hello' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Echo received'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Echo hello',
    });

    const result = await completion.run();

    expect(callCount).toBe(2);
    expect(result.state).toBe('completed');
    expect(result.output).toHaveLength(2);

    const toolOutput = result.output[0];
    expect(toolOutput).toMatchObject({
      type: 'tool',
      function: 'test.echo',
      input: { message: 'hello' },
      result: { type: 'success', output: { echoed: 'hello' } },
    });

    expect(result.output[1]).toMatchObject({
      type: 'text',
      content: 'Echo received',
    });
  });

  it('recovers when a tool throws an error', async () => {
    const failingTool = createTool({
      id: 'test.fail',
      description: 'Always fails',
      input: z.object({ value: z.string() }),
      output: z.unknown(),
      invoke: async () => {
        throw new Error('Something went wrong');
      },
    });

    const plugin = createPlugin({
      id: 'test',
      name: 'Test Plugin',
      config: z.unknown(),
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(failingTool);
      },
    });

    await services.get(PluginService).register(plugin, undefined);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('test.fail', { value: 'test' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('I encountered an error and recovered'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Try the tool',
    });

    const result = await completion.run();

    expect(callCount).toBe(2);
    expect(result.state).toBe('completed');
    expect(result.output).toHaveLength(2);

    const toolOutput = result.output[0];
    expect(toolOutput).toMatchObject({
      type: 'tool',
      function: 'test.fail',
      result: { type: 'error' },
    });
    if (toolOutput.type === 'tool') {
      expect(toolOutput.result.error).toContain('Something went wrong');
    }

    expect(result.output[1]).toMatchObject({
      type: 'text',
      content: 'I encountered an error and recovered',
    });
  });

  it('feeds back an error when the model calls a non-existent tool', async () => {
    const realTool = createTool({
      id: 'test.real',
      description: 'A real tool',
      input: z.object({ x: z.number() }),
      output: z.object({ result: z.number() }),
      invoke: async ({ input }) => ({ result: input.x * 2 }),
    });

    const plugin = createPlugin({
      id: 'test',
      name: 'Test Plugin',
      config: z.unknown(),
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(realTool);
      },
    });

    await services.get(PluginService).register(plugin, undefined);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('test.nonexistent', { x: 1 }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Fixed'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Do something',
    });

    const result = await completion.run();

    expect(callCount).toBe(2);
    const toolOutput = result.output[0];
    expect(toolOutput).toMatchObject({
      type: 'tool',
      function: 'test.nonexistent',
      result: { type: 'error' },
    });
    if (toolOutput.type === 'tool') {
      expect(toolOutput.result.error).toContain('not found');
      expect(toolOutput.result.error).toContain('test.real');
    }
  });

  it('feeds back a validation error when tool arguments are invalid', async () => {
    const strictTool = createTool({
      id: 'test.strict',
      description: 'Needs a number',
      input: z.object({ count: z.number() }),
      output: z.object({ doubled: z.number() }),
      invoke: async ({ input }) => ({ doubled: input.count * 2 }),
    });

    const plugin = createPlugin({
      id: 'test',
      name: 'Test Plugin',
      config: z.unknown(),
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(strictTool);
      },
    });

    await services.get(PluginService).register(plugin, undefined);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          // Model sends a string instead of a number
          return toSSE(createToolCallApiResponse('test.strict', { count: 'not-a-number' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Corrected'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Double 5',
    });

    const result = await completion.run();

    expect(callCount).toBe(2);
    const toolOutput = result.output[0];
    expect(toolOutput).toMatchObject({
      type: 'tool',
      function: 'test.strict',
      result: { type: 'error' },
    });
    if (toolOutput.type === 'tool') {
      expect(toolOutput.result.error).toContain('test.strict');
    }
  });

  it('emits output and completed events', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return toSSE(createTextApiResponse('Done'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Hello',
    });

    const eventService = services.get(EventService);
    const outputSpy = vi.fn();
    const completedSpy = vi.fn();
    eventService.listen(promptOutputEvent, outputSpy);
    eventService.listen(promptCompletedEvent, completedSpy);

    await completion.run();

    expect(outputSpy).toHaveBeenCalled();
    expect(completedSpy).toHaveBeenCalledOnce();
  });

  it('sends tool results back to the model in the next request', async () => {
    const addTool = createTool({
      id: 'test.add',
      description: 'Adds two numbers',
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ sum: z.number() }),
      invoke: async ({ input }) => ({ sum: input.a + input.b }),
    });

    const plugin = createPlugin({
      id: 'test',
      name: 'Test Plugin',
      config: z.unknown(),
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(addTool);
      },
    });

    await services.get(PluginService).register(plugin, undefined);

    let callCount = 0;
    const capturedBodies: unknown[] = [];
    server.use(
      http.post(RESPONSES_URL, async ({ request }) => {
        callCount++;
        capturedBodies.push(await request.json());
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('test.add', { a: 2, b: 3 }, 'call_1'));
        }
        return toSSE(createTextApiResponse('The sum is 5'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Add 2 and 3',
    });

    await completion.run();

    expect(callCount).toBe(2);

    // The second request should include the tool result in the prompt history
    const secondBody = capturedBodies[1] as { input: { type?: string; role?: string; content?: string }[] };
    const messages = secondBody.input;

    // Should contain a function_call_output with the tool result
    const toolResultMessage = messages.find((m: Record<string, unknown>) => m.type === 'function_call_output');
    expect(toolResultMessage).toBeDefined();
    expect(JSON.parse((toolResultMessage as { output: string }).output)).toEqual({ sum: 5 });
  });

  describe('requireApproval', () => {
    it('pauses with static requireApproval', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Sensitive operation' },
        invoke: async ({ input }) => ({ result: input.value }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      server.use(
        http.post(RESPONSES_URL, () => {
          return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      const eventService = services.get(EventService);
      const approvalSpy = vi.fn();
      eventService.listen(promptApprovalRequestedEvent, approvalSpy);

      const result = await completion.run();

      expect(result.state).toBe('waiting_for_approval');
      expect(approvalSpy).toHaveBeenCalledOnce();
      expect(approvalSpy.mock.calls[0][0]).toMatchObject({
        promptId: completion.id,
        request: {
          toolCallId: 'call_1',
          toolName: 'test.gated',
          input: { value: 'hello' },
          reason: 'Sensitive operation',
        },
      });

      const toolOutput = result.output[0];
      expect(toolOutput).toMatchObject({
        type: 'tool',
        result: { type: 'pending', reason: 'Sensitive operation' },
      });
    });

    it('runs normally with dynamic requireApproval returning required: false', async () => {
      const conditionalTool = createTool({
        id: 'test.conditional',
        description: 'Conditionally gated',
        input: z.object({ safe: z.boolean() }),
        output: z.object({ done: z.boolean() }),
        requireApproval: async ({ input }) => ({
          required: !input.safe,
          reason: 'Unsafe operation',
        }),
        invoke: async () => ({ done: true }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(conditionalTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.conditional', { safe: true }, 'call_1'));
          }
          return toSSE(createTextApiResponse('All done'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do safe thing',
      });

      const result = await completion.run();

      expect(result.state).toBe('completed');
      expect(result.output[0]).toMatchObject({
        type: 'tool',
        result: { type: 'success', output: { done: true } },
      });
    });

    it('approve() invokes the tool and resumes to completion', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Sensitive' },
        invoke: async ({ input }) => ({ result: input.value.toUpperCase() }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Approved and done'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      await completion.run();
      expect(completion.prompt.state).toBe('waiting_for_approval');

      const eventService = services.get(EventService);
      const completedSpy = vi.fn();
      eventService.listen(promptCompletedEvent, completedSpy);

      await completion.approve('call_1');

      expect(completedSpy).toHaveBeenCalledOnce();
      expect(completion.prompt.state).toBe('completed');

      const toolOutput = completion.prompt.output[0];
      expect(toolOutput).toMatchObject({
        type: 'tool',
        result: { type: 'success', output: { result: 'HELLO' } },
      });
    });

    it('reject() feeds error back and resumes to completion', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Sensitive' },
        invoke: async ({ input }) => ({ result: input.value }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Rejected and recovered'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      await completion.run();
      expect(completion.prompt.state).toBe('waiting_for_approval');

      await completion.reject('call_1', 'Not allowed');

      expect(completion.prompt.state).toBe('completed');
      const toolOutput = completion.prompt.output[0];
      expect(toolOutput).toMatchObject({
        type: 'tool',
        result: { type: 'error', error: 'Not allowed' },
      });
    });

    it('reject() uses default reason when none provided', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Sensitive' },
        invoke: async ({ input }) => ({ result: input.value }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Done'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      await completion.run();
      await completion.reject('call_1');

      const toolOutput = completion.prompt.output[0];
      expect(toolOutput).toMatchObject({
        type: 'tool',
        result: { type: 'error', error: 'Rejected by user' },
      });
    });

    it('processes remaining tool calls after approve, pausing again if needed', async () => {
      const normalTool = createTool({
        id: 'test.normal',
        description: 'No approval needed',
        input: z.object({ x: z.number() }),
        output: z.object({ doubled: z.number() }),
        invoke: async ({ input }) => ({ doubled: input.x * 2 }),
      });

      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Gated' },
        invoke: async ({ input }) => ({ result: input.value }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
          prepare.tools.push(normalTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(
              createMultiToolCallApiResponse([
                { name: 'test.gated', args: { value: 'first' }, callId: 'call_1' },
                { name: 'test.normal', args: { x: 5 }, callId: 'call_2' },
              ]),
            );
          }
          return toSSE(createTextApiResponse('All done'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do both',
      });

      await completion.run();
      expect(completion.prompt.state).toBe('waiting_for_approval');
      // Only the pending tool output should be present
      expect(completion.prompt.output).toHaveLength(1);

      await completion.approve('call_1');

      expect(completion.prompt.state).toBe('completed');
      // Gated tool + normal tool + text
      expect(completion.prompt.output).toHaveLength(3);
      expect(completion.prompt.output[0]).toMatchObject({
        type: 'tool',
        function: 'test.gated',
        result: { type: 'success', output: { result: 'first' } },
      });
      expect(completion.prompt.output[1]).toMatchObject({
        type: 'tool',
        function: 'test.normal',
        result: { type: 'success', output: { doubled: 10 } },
      });
    });

    it('approve/reject on non-pending completion is a no-op', async () => {
      server.use(
        http.post(RESPONSES_URL, () => {
          return toSSE(createTextApiResponse('Hello'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Hi',
      });

      await completion.run();
      expect(completion.prompt.state).toBe('completed');

      // Should not throw or change state
      await completion.approve('nonexistent');
      await completion.reject('nonexistent');
      expect(completion.prompt.state).toBe('completed');
    });
  });

  describe('approval flow tests', () => {
    it('full approve flow: pause → approve → model called again → text completion', async () => {
      const invokeSpy = vi.fn(async ({ input }: { input: { value: string } }) => ({
        result: input.value.toUpperCase(),
      }));

      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Gated' },
        invoke: invokeSpy,
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Approved result'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      // Phase 1: run until paused
      await completion.run();
      expect(callCount).toBe(1);
      expect(completion.prompt.state).toBe('waiting_for_approval');
      expect(invokeSpy).not.toHaveBeenCalled();

      // Phase 2: approve → tool invoked → model called → text
      await completion.approve('call_1');
      expect(callCount).toBe(2);
      expect(invokeSpy).toHaveBeenCalledOnce();
      expect(completion.prompt.state).toBe('completed');
      expect(completion.prompt.output).toHaveLength(2);
      expect(completion.prompt.output[0]).toMatchObject({
        type: 'tool',
        result: { type: 'success', output: { result: 'HELLO' } },
      });
      expect(completion.prompt.output[1]).toMatchObject({
        type: 'text',
        content: 'Approved result',
      });
    });

    it('full reject flow: pause → reject → model called again → text completion', async () => {
      const invokeSpy = vi.fn(async () => ({ result: 'never called' }));

      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Gated' },
        invoke: invokeSpy,
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Rejection acknowledged'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      await completion.run();
      expect(completion.prompt.state).toBe('waiting_for_approval');

      await completion.reject('call_1', 'User denied');
      expect(invokeSpy).not.toHaveBeenCalled();
      expect(callCount).toBe(2);
      expect(completion.prompt.state).toBe('completed');
      expect(completion.prompt.output[0]).toMatchObject({
        type: 'tool',
        result: { type: 'error', error: 'User denied' },
      });
      expect(completion.prompt.output[1]).toMatchObject({
        type: 'text',
        content: 'Rejection acknowledged',
      });
    });

    it('event sequence: output → approval-requested → (approve) → output → completed', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Gated' },
        invoke: async ({ input }) => ({ result: input.value }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'x' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Done'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Go',
      });

      const events: string[] = [];
      const eventService = services.get(EventService);
      eventService.listen(promptOutputEvent, () => events.push('output'));
      eventService.listen(promptApprovalRequestedEvent, () => events.push('approval-requested'));
      eventService.listen(promptCompletedEvent, () => events.push('completed'));

      await completion.run();
      expect(events).toEqual(['output', 'approval-requested']);

      await completion.approve('call_1');
      expect(events).toEqual(['output', 'approval-requested', 'output', 'completed']);
    });

    it('dynamic approval that pauses on required: true', async () => {
      const conditionalTool = createTool({
        id: 'test.conditional',
        description: 'Conditionally gated',
        input: z.object({ safe: z.boolean() }),
        output: z.object({ done: z.boolean() }),
        requireApproval: async ({ input }) => ({
          required: !input.safe,
          reason: 'Unsafe operation',
        }),
        invoke: async () => ({ done: true }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(conditionalTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.conditional', { safe: false }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Approved'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do unsafe',
      });

      const eventService = services.get(EventService);
      const approvalSpy = vi.fn();
      eventService.listen(promptApprovalRequestedEvent, approvalSpy);

      await completion.run();
      expect(completion.prompt.state).toBe('waiting_for_approval');
      expect(approvalSpy).toHaveBeenCalledOnce();
      expect(approvalSpy.mock.calls[0][0]).toMatchObject({
        request: { reason: 'Unsafe operation' },
      });

      await completion.approve('call_1');
      expect(completion.prompt.state).toBe('completed');
    });

    it('chained approvals: two gated tools in one batch require sequential approval', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Gated' },
        invoke: async ({ input }) => ({ result: input.value }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      server.use(
        http.post(RESPONSES_URL, () => {
          callCount++;
          if (callCount === 1) {
            return toSSE(
              createMultiToolCallApiResponse([
                { name: 'test.gated', args: { value: 'first' }, callId: 'call_1' },
                { name: 'test.gated', args: { value: 'second' }, callId: 'call_2' },
              ]),
            );
          }
          return toSSE(createTextApiResponse('Both approved'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do both',
      });

      // First pause
      await completion.run();
      expect(completion.prompt.state).toBe('waiting_for_approval');
      expect(completion.prompt.output).toHaveLength(1);
      expect(completion.prompt.output[0]).toMatchObject({ id: 'call_1' });

      // Approve first → second pauses
      await completion.approve('call_1');
      expect(completion.prompt.state).toBe('waiting_for_approval');
      expect(completion.prompt.output).toHaveLength(2);
      expect(completion.prompt.output[1]).toMatchObject({
        id: 'call_2',
        result: { type: 'pending' },
      });

      // Approve second → model called → complete
      await completion.approve('call_2');
      expect(completion.prompt.state).toBe('completed');
      expect(callCount).toBe(2);
      expect(completion.prompt.output).toHaveLength(3);
      expect(completion.prompt.output[0]).toMatchObject({
        type: 'tool',
        result: { type: 'success', output: { result: 'first' } },
      });
      expect(completion.prompt.output[1]).toMatchObject({
        type: 'tool',
        result: { type: 'success', output: { result: 'second' } },
      });
      expect(completion.prompt.output[2]).toMatchObject({
        type: 'text',
        content: 'Both approved',
      });
    });

    it('approved tool result is sent back to model in next request', async () => {
      const gatedTool = createTool({
        id: 'test.gated',
        description: 'Needs approval',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        requireApproval: { required: true, reason: 'Gated' },
        invoke: async ({ input }) => ({ result: input.value.toUpperCase() }),
      });

      const plugin = createPlugin({
        id: 'test',
        name: 'Test Plugin',
        state: z.unknown(),
        prepare: async (prepare) => {
          prepare.tools.push(gatedTool);
        },
      });

      await services.get(PluginService).register(plugin, undefined);

      let callCount = 0;
      const capturedBodies: unknown[] = [];
      server.use(
        http.post(RESPONSES_URL, async ({ request }) => {
          callCount++;
          capturedBodies.push(await request.json());
          if (callCount === 1) {
            return toSSE(createToolCallApiResponse('test.gated', { value: 'hello' }, 'call_1'));
          }
          return toSSE(createTextApiResponse('Got it'));
        }),
      );

      const completion = new PromptCompletion({
        services,
        userId: 'user-1',
        input: 'Do it',
      });

      await completion.run();
      await completion.approve('call_1');

      expect(callCount).toBe(2);

      // The second model request should contain the approved tool result
      const secondBody = capturedBodies[1] as { input: { type?: string; output?: string }[] };
      const toolResultMessage = secondBody.input.find(
        (m: Record<string, unknown>) => m.type === 'function_call_output',
      ) as { output: string } | undefined;
      expect(toolResultMessage).toBeDefined();
      expect(JSON.parse((toolResultMessage as { output: string }).output)).toEqual({ result: 'HELLO' });
    });
  });
});
