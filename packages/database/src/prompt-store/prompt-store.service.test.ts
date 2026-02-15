import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Services, PromptService } from '@morten-olsen/agentic-core';

import { DatabaseService } from '../database/database.service.js';

import { promptStoreDatabase } from './prompt-store.database.js';
import { PromptStoreService } from './prompt-store.service.js';

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

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('PromptStoreService', () => {
  let services: Services;

  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', TEST_BASE_URL);
    services = new Services();
    const dbService = services.get(DatabaseService);
    await dbService.get(promptStoreDatabase);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('captures a prompt on creation and updates on completion', async () => {
    const promptStore = services.get(PromptStoreService);
    promptStore.listen();

    server.use(
      http.post(RESPONSES_URL, () => {
        return HttpResponse.json(createTextApiResponse('Hello!'));
      }),
    );

    const promptService = services.get(PromptService);
    const completion = promptService.create({
      model: 'test-model',
      input: 'Say hello',
    });

    // After creation, prompt should be saved as running
    await vi.waitFor(async () => {
      const stored = await promptStore.getById(completion.id);
      expect(stored).toBeDefined();
      expect(stored?.state).toBe('running');
    });

    await completion.run();

    // After completion, prompt should be updated
    await vi.waitFor(async () => {
      const stored = await promptStore.getById(completion.id);
      expect(stored).toBeDefined();
      expect(stored?.state).toBe('completed');
      expect(stored?.output).toHaveLength(1);
      expect(stored?.output[0]).toMatchObject({ type: 'text', content: 'Hello!' });
    });
  });

  it('retrieves multiple prompts by IDs preserving order', async () => {
    const promptStore = services.get(PromptStoreService);
    promptStore.listen();

    server.use(
      http.post(RESPONSES_URL, () => {
        return HttpResponse.json(createTextApiResponse('Response'));
      }),
    );

    const promptService = services.get(PromptService);

    const c1 = promptService.create({ model: 'test-model', input: 'First' });
    await c1.run();

    const c2 = promptService.create({ model: 'test-model', input: 'Second' });
    await c2.run();

    // Request in reverse order — should get them back in the requested order
    const results = await promptStore.getByIds([c2.id, c1.id]);
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe(c2.id);
    expect(results[1]?.id).toBe(c1.id);
  });

  it('searches prompts with limit and offset', async () => {
    const promptStore = services.get(PromptStoreService);
    promptStore.listen();

    server.use(
      http.post(RESPONSES_URL, () => {
        return HttpResponse.json(createTextApiResponse('R'));
      }),
    );

    const promptService = services.get(PromptService);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = promptService.create({ model: 'test-model', input: `Msg ${i}` });
      ids.push(c.id);
      await c.run();
    }

    const all = await promptStore.search({ limit: 10 });
    expect(all).toHaveLength(3);

    const page = await promptStore.search({ limit: 1, offset: 1 });
    expect(page).toHaveLength(1);
  });
});
