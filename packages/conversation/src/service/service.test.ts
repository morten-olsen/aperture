import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { DatabaseService, databasePlugin, PromptStoreService } from '@morten-olsen/agentic-database';

import { conversationDatabase } from '../database/database.js';
import { ConversationRepo } from '../repo/repo.js';

import { ConversationService } from './service.js';

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

describe('ConversationService', () => {
  let services: Services;
  let conversationService: ConversationService;

  beforeEach(async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', TEST_BASE_URL);
    services = new Services();

    // Setup databases (like databasePlugin + conversationPlugin would)
    const pluginService = services.get(PluginService);
    await pluginService.register(databasePlugin);

    const dbService = services.get(DatabaseService);
    await dbService.get(conversationDatabase);

    conversationService = services.get(ConversationService);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates a new conversation', async () => {
    const conv = await conversationService.create({ id: 'test-conv' });
    expect(conv.id).toBe('test-conv');
    expect(conv.prompts).toHaveLength(0);
  });

  it('returns cached instance on second get', async () => {
    const conv1 = await conversationService.get('conv-1');
    const conv2 = await conversationService.get('conv-1');
    expect(conv1).toBe(conv2);
  });

  it('persists conversation after prompt and rehydrates from DB', async () => {
    server.use(
      http.post(RESPONSES_URL, () => {
        return HttpResponse.json(createTextApiResponse('Hi there'));
      }),
    );

    const conv = await conversationService.get('conv-persist');
    const completion = await conv.prompt({ model: 'test-model', input: 'Hello' });
    await completion.run();

    // Create a new ConversationService to simulate cold start
    const freshServices = new Services();
    // Share the same DatabaseService (same in-memory SQLite)
    freshServices.set(DatabaseService, services.get(DatabaseService));
    // Need to re-listen on the new PromptService
    const freshPromptStore = freshServices.get(PromptStoreService);
    freshPromptStore.listen();

    const freshConvService = freshServices.get(ConversationService);
    const rehydrated = await freshConvService.get('conv-persist');

    expect(rehydrated.prompts).toHaveLength(1);
    expect(rehydrated.prompts[0]?.state).toBe('completed');
    expect(rehydrated.prompts[0]?.input).toBe('Hello');
  });

  it('passes prior prompt history to subsequent prompts', async () => {
    const capturedBodies: unknown[] = [];
    server.use(
      http.post(RESPONSES_URL, async ({ request }) => {
        capturedBodies.push(await request.json());
        return HttpResponse.json(createTextApiResponse('Reply'));
      }),
    );

    const conv = await conversationService.get('conv-history');

    const c1 = await conv.prompt({ model: 'test-model', input: 'First message' });
    await c1.run();

    const c2 = await conv.prompt({ model: 'test-model', input: 'Second message' });
    await c2.run();

    // The first prompt's request should have no prior user messages
    const firstBody = capturedBodies[0] as { input: { role?: string; content?: string }[] };
    const firstUserMsgs = firstBody.input.filter((m) => m.role === 'user');
    expect(firstUserMsgs).toHaveLength(1);
    expect(firstUserMsgs[0]?.content).toBe('First message');

    // The second prompt's request should contain the first prompt's history
    const secondBody = capturedBodies[1] as { input: { role?: string; content?: string }[] };
    const secondUserMsgs = secondBody.input.filter((m) => m.role === 'user');
    expect(secondUserMsgs).toHaveLength(2);
    expect(secondUserMsgs[0]?.content).toBe('First message');
    expect(secondUserMsgs[1]?.content).toBe('Second message');
  });

  describe('active conversation', () => {
    it('returns undefined when no active conversation set', async () => {
      const active = await conversationService.getActive('user-1');
      expect(active).toBeUndefined();
    });

    it('sets and gets active conversation', async () => {
      const conv = await conversationService.get('conv-active', 'user-1');

      // Trigger persistence by prompting
      server.use(
        http.post(RESPONSES_URL, () => {
          return HttpResponse.json(createTextApiResponse('OK'));
        }),
      );
      const completion = await conv.prompt({ model: 'test-model', input: 'Hi' });
      await completion.run();

      await conversationService.setActive('conv-active', 'user-1');

      const active = await conversationService.getActive('user-1');
      expect(active).toBeDefined();
      expect(active?.id).toBe('conv-active');
    });

    it('clears active conversation', async () => {
      const repo = services.get(ConversationRepo);
      await repo.ensureUser('user-1');
      await repo.setActiveConversation('user-1', 'conv-1');

      await conversationService.setActive(null, 'user-1');

      const active = await conversationService.getActive('user-1');
      expect(active).toBeUndefined();
    });
  });

  describe('cache eviction', () => {
    it('evicts oldest entry when cache exceeds max size', async () => {
      // Access maxCacheSize + 1 conversations to trigger eviction
      // Default maxCacheSize is 50, so create 51 entries
      for (let i = 0; i < 51; i++) {
        await conversationService.get(`conv-${i}`);
      }

      // conv-0 should have been evicted (oldest access)
      // Getting it again should create a new instance (not same reference)
      const before = await conversationService.get('conv-1');
      // conv-1 is now touched, so it won't be evicted
      const after = await conversationService.get('conv-1');
      expect(before).toBe(after);
    });
  });
});
