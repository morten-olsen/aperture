import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import { PromptCompletion, Services, PluginService, createPlugin, createTool } from '@morten-olsen/agentic-core';

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
        return HttpResponse.json(createTextApiResponse('Hello, world!'));
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
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(echoTool);
      },
    });

    await services.get(PluginService).register(plugin);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(createToolCallApiResponse('test.echo', { message: 'hello' }, 'call_1'));
        }
        return HttpResponse.json(createTextApiResponse('Echo received'));
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
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(failingTool);
      },
    });

    await services.get(PluginService).register(plugin);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(createToolCallApiResponse('test.fail', { value: 'test' }, 'call_1'));
        }
        return HttpResponse.json(createTextApiResponse('I encountered an error and recovered'));
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
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(realTool);
      },
    });

    await services.get(PluginService).register(plugin);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(createToolCallApiResponse('test.nonexistent', { x: 1 }, 'call_1'));
        }
        return HttpResponse.json(createTextApiResponse('Fixed'));
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
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(strictTool);
      },
    });

    await services.get(PluginService).register(plugin);

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          // Model sends a string instead of a number
          return HttpResponse.json(createToolCallApiResponse('test.strict', { count: 'not-a-number' }, 'call_1'));
        }
        return HttpResponse.json(createTextApiResponse('Corrected'));
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

  it('emits updated and completed events', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return HttpResponse.json(createTextApiResponse('Done'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      model: 'test-model',
      input: 'Hello',
    });

    const updatedSpy = vi.fn();
    const completedSpy = vi.fn();
    completion.on('updated', updatedSpy);
    completion.on('completed', completedSpy);

    await completion.run();

    expect(updatedSpy).toHaveBeenCalled();
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
      state: z.unknown(),
      prepare: async (prepare) => {
        prepare.tools.push(addTool);
      },
    });

    await services.get(PluginService).register(plugin);

    let callCount = 0;
    const capturedBodies: unknown[] = [];
    server.use(
      http.post(RESPONSES_URL, async ({ request }) => {
        callCount++;
        capturedBodies.push(await request.json());
        if (callCount === 1) {
          return HttpResponse.json(createToolCallApiResponse('test.add', { a: 2, b: 3 }, 'call_1'));
        }
        return HttpResponse.json(createTextApiResponse('The sum is 5'));
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
});
