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
import { skillPlugin } from '@morten-olsen/agentic-skill';

import { sshPlugin } from '../plugin/plugin.js';

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('node:events');

  class MockChannel extends EventEmitter {
    stderr = new EventEmitter();
  }

  class MockClient extends EventEmitter {
    connect() {
      process.nextTick(() => this.emit('ready'));
    }
    exec(_cmd: string, cb: (err: Error | null, channel: MockChannel) => void) {
      const channel = new MockChannel();
      cb(null, channel);
      process.nextTick(() => {
        channel.emit('data', Buffer.from('mock output\n'));
        channel.emit('close', 0);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    end() {}
  }

  return { Client: MockClient };
});

const TEST_BASE_URL = 'https://test.openai.com/v1';
const RESPONSES_URL = `${TEST_BASE_URL}/responses`;
const SKILL_STATE = { skills: { active: ['ssh'] } };

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

describe('ssh approval gate flow', () => {
  let services: Services;

  beforeEach(async () => {
    services = Services.mock();
    await services.get(PluginService).register(skillPlugin, undefined);
    await services.get(PluginService).register(sshPlugin, {});

    const { SshService } = await import('../service/service.js');
    const sshService = services.get(SshService);
    await sshService.addHost('user-1', { id: 'web', hostname: '10.0.0.1', port: 22, username: 'deploy' });
  });

  it('pauses for approval when executing a non-whitelisted command', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return toSSE(createToolCallApiResponse('ssh.execute', { hostId: 'web', command: 'ls -la' }, 'call_1'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'List files on web',
      state: SKILL_STATE,
    });

    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    const result = await completion.run();

    expect(result.state).toBe('waiting_for_approval');
    expect(approvalSpy).toHaveBeenCalledOnce();
    expect(approvalSpy.mock.calls[0][0]).toMatchObject({
      request: { toolCallId: 'call_1', toolName: 'ssh.execute' },
    });
  });

  it('executes successfully after approval', async () => {
    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('ssh.execute', { hostId: 'web', command: 'ls -la' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Done'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'List files on web',
      state: SKILL_STATE,
    });
    await completion.run();
    await completion.approve('call_1');

    expect(completion.prompt.state).toBe('completed');
    expect(completion.prompt.output[0]).toMatchObject({
      type: 'tool',
      function: 'ssh.execute',
      result: { type: 'success', output: { hostId: 'web', command: 'ls -la', exitCode: 0 } },
    });
  });

  it('returns error after rejection', async () => {
    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('ssh.execute', { hostId: 'web', command: 'rm /' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Rejected'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Delete on web',
      state: SKILL_STATE,
    });
    await completion.run();
    await completion.reject('call_1', 'Not authorized');

    expect(completion.prompt.state).toBe('completed');
    expect(completion.prompt.output[0]).toMatchObject({
      type: 'tool',
      function: 'ssh.execute',
      result: { type: 'error', error: 'Not authorized' },
    });
  });

  it('skips approval for whitelisted commands', async () => {
    const { SshService } = await import('../service/service.js');
    const sshService = services.get(SshService);
    await sshService.addRule('user-1', 'ls *', '*', 'allow');

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('ssh.execute', { hostId: 'web', command: 'ls -la' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Done'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'List files',
      state: SKILL_STATE,
    });
    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    const result = await completion.run();

    expect(result.state).toBe('completed');
    expect(approvalSpy).not.toHaveBeenCalled();
  });

  it('does not skip approval when rule belongs to a different user', async () => {
    const { SshService } = await import('../service/service.js');
    const sshService = services.get(SshService);
    await sshService.addRule('user-2', 'ls *', '*', 'allow');

    server.use(
      http.post(RESPONSES_URL, () => {
        return toSSE(createToolCallApiResponse('ssh.execute', { hostId: 'web', command: 'ls -la' }, 'call_1'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'List files',
      state: SKILL_STATE,
    });
    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    await completion.run();
    expect(approvalSpy).toHaveBeenCalledOnce();
  });

  it('fails with error for denied commands even after approval', async () => {
    const { SshService } = await import('../service/service.js');
    const sshService = services.get(SshService);
    await sshService.addRule('user-1', 'rm *', '*', 'deny');

    let callCount = 0;
    server.use(
      http.post(RESPONSES_URL, () => {
        callCount++;
        if (callCount === 1) {
          return toSSE(createToolCallApiResponse('ssh.execute', { hostId: 'web', command: 'rm -rf /' }, 'call_1'));
        }
        return toSSE(createTextApiResponse('Cannot do that'));
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Delete everything',
      state: SKILL_STATE,
    });
    await completion.run();
    await completion.approve('call_1');

    expect(completion.prompt.state).toBe('completed');
    expect(completion.prompt.output[0]).toMatchObject({
      type: 'tool',
      function: 'ssh.execute',
      result: { type: 'error' },
    });
  });

  it('always requires approval for add-host', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return toSSE(
          createToolCallApiResponse(
            'ssh.add-host',
            { id: 'db', hostname: '10.0.0.2', port: 22, username: 'admin' },
            'call_1',
          ),
        );
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Add db host',
      state: SKILL_STATE,
    });
    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    await completion.run();

    expect(completion.prompt.state).toBe('waiting_for_approval');
    expect(approvalSpy).toHaveBeenCalledOnce();
    expect(approvalSpy.mock.calls[0][0]).toMatchObject({
      request: { toolName: 'ssh.add-host', reason: 'Adding a host registers a new SSH connection target.' },
    });
  });

  it('always requires approval for add-rule', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return toSSE(
          createToolCallApiResponse('ssh.add-rule', { pattern: 'ls *', host: '*', type: 'allow' }, 'call_1'),
        );
      }),
    );

    const completion = new PromptCompletion({
      services,
      userId: 'user-1',
      input: 'Allow ls commands',
      state: SKILL_STATE,
    });
    const approvalSpy = vi.fn();
    const eventService = services.get(EventService);
    eventService.listen(promptApprovalRequestedEvent, approvalSpy);

    await completion.run();

    expect(completion.prompt.state).toBe('waiting_for_approval');
    expect(approvalSpy).toHaveBeenCalledOnce();
    expect(approvalSpy.mock.calls[0][0]).toMatchObject({
      request: { toolName: 'ssh.add-rule', reason: 'Adding a rule modifies SSH command execution permissions.' },
    });
  });
});
