import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  PromptCompletion,
  Services,
  PluginService,
  EventService,
  promptApprovalRequestedEvent,
} from '@morten-olsen/agentic-core';

import { webFetchPlugin } from '../plugin/plugin.js';

const TEST_BASE_URL = 'https://test.openai.com/v1';
const RESPONSES_URL = `${TEST_BASE_URL}/responses`;
const TEST_HTML = '<html><body><h1>Hello World</h1></body></html>';

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

describe('web-fetch approval gate flow', () => {
  let services: Services;

  beforeEach(async () => {
    services = Services.mock();
    await services.get(PluginService).register(webFetchPlugin, {});
  });

  it('pauses for approval when fetching a non-whitelisted domain', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return HttpResponse.json(
          createToolCallApiResponse('web-fetch.fetch', { url: 'https://example.com/page' }, 'call_1'),
        );
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Fetch example.com',
    });

    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    const result = await completion.run();

    expect(result.state).toBe('waiting_for_approval');
    expect(approvalSpy).toHaveBeenCalledOnce();
    expect(approvalSpy.mock.calls[0][0]).toMatchObject({
      request: {
        toolCallId: 'call_1',
        toolName: 'web-fetch.fetch',
        reason: 'Domain "example.com" is not on the allowlist.',
      },
    });

    const toolOutput = result.output[0];
    expect(toolOutput).toMatchObject({
      type: 'tool',
      function: 'web-fetch.fetch',
      result: { type: 'pending', reason: 'Domain "example.com" is not on the allowlist.' },
    });
  });

  it('fetches successfully after approval for non-whitelisted domain', async () => {
    server.use(http.get('https://example.com/page', () => HttpResponse.html(TEST_HTML)));

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            createToolCallApiResponse('web-fetch.fetch', { url: 'https://example.com/page', mode: 'html' }, 'call_1'),
          );
        }
        return HttpResponse.json(createTextApiResponse('Here is the page content'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Fetch example.com',
    });

    await completion.run();
    expect(completion.prompt.state).toBe('waiting_for_approval');

    await completion.approve('call_1');

    expect(completion.prompt.state).toBe('completed');
    expect(callCount).toBe(2);

    const toolOutput = completion.prompt.output[0];
    expect(toolOutput).toMatchObject({
      type: 'tool',
      function: 'web-fetch.fetch',
      result: {
        type: 'success',
        output: {
          url: 'https://example.com/page',
          domain: 'example.com',
          mode: 'html',
          content: TEST_HTML,
        },
      },
    });
  });

  it('returns error after rejection for non-whitelisted domain', async () => {
    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            createToolCallApiResponse('web-fetch.fetch', { url: 'https://blocked.com/page' }, 'call_1'),
          );
        }
        return HttpResponse.json(createTextApiResponse('I cannot fetch that domain'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Fetch blocked.com',
    });

    await completion.run();
    expect(completion.prompt.state).toBe('waiting_for_approval');

    await completion.reject('call_1', 'Not authorized');

    expect(completion.prompt.state).toBe('completed');
    expect(completion.prompt.output[0]).toMatchObject({
      type: 'tool',
      function: 'web-fetch.fetch',
      result: { type: 'error', error: 'Not authorized' },
    });
  });

  it('skips approval for whitelisted domains', async () => {
    server.use(http.get('https://allowed.com/page', () => HttpResponse.html(TEST_HTML)));

    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    await service.addDomain('allowed.com');

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            createToolCallApiResponse('web-fetch.fetch', { url: 'https://allowed.com/page', mode: 'html' }, 'call_1'),
          );
        }
        return HttpResponse.json(createTextApiResponse('Fetched'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Fetch allowed.com',
    });

    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    const result = await completion.run();

    expect(result.state).toBe('completed');
    expect(approvalSpy).not.toHaveBeenCalled();
    expect(result.output[0]).toMatchObject({
      type: 'tool',
      function: 'web-fetch.fetch',
      result: { type: 'success' },
    });
  });

  it('always requires approval for add-domain', async () => {
    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            createToolCallApiResponse('web-fetch.add-domain', { domain: 'new-site.com' }, 'call_1'),
          );
        }
        return HttpResponse.json(createTextApiResponse('Domain added'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Add new-site.com',
    });

    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    await completion.run();

    expect(completion.prompt.state).toBe('waiting_for_approval');
    expect(approvalSpy).toHaveBeenCalledOnce();
    expect(approvalSpy.mock.calls[0][0]).toMatchObject({
      request: {
        toolName: 'web-fetch.add-domain',
        reason: 'Adding a domain grants permanent fetch access.',
      },
    });

    await completion.approve('call_1');

    expect(completion.prompt.state).toBe('completed');

    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    expect(await service.isAllowed('new-site.com')).toBe(true);
  });
});
