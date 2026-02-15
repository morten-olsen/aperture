# Testing

This document covers the test infrastructure, conventions, and patterns used across the framework.

## Running Tests

```bash
# All tests (lint + unit)
pnpm test

# Unit tests only (with coverage)
pnpm test:unit

# Single package
pnpm --filter @morten-olsen/agentic-core test:unit

# Single file
pnpm vitest --run packages/core/src/prompt/prompt.completion.test.ts

# Watch mode (re-runs on file changes)
pnpm vitest packages/core/src/prompt/prompt.completion.test.ts
```

## Stack

- **Vitest** — Test runner and assertion library
- **MSW (Mock Service Worker)** — HTTP-level API mocking for the OpenAI provider
- **Zod** — Schema validation (same schemas used in production code)

## Test File Conventions

- Place test files next to the code they test: `{module}.test.ts` alongside `{module}.ts`
- Test files must be excluded from `tsconfig.json` builds (add `"src/**/*.test.ts"` to `exclude`)
- Import from the package name (`@morten-olsen/agentic-core`) not relative paths — vitest aliases resolve these to source files

```typescript
// Good — uses the same import path as consumers
import { PromptCompletion, Services, PluginService } from '@morten-olsen/agentic-core';

// Bad — brittle relative paths
import { PromptCompletion } from './prompt.completion.js';
```

## Test Aliasing

Each package's `vitest.config.ts` uses `@morten-olsen/agentic-tests/vitest` to map workspace package names to their `src/exports.ts` source files. This means tests run against source code directly — no build step required.

## MSW Patterns

The framework uses [MSW](https://mswjs.io/) to mock the OpenAI API at the HTTP level rather than mocking the OpenAI SDK directly. This provides more realistic tests that exercise the full request/response cycle.

### Basic Setup

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const TEST_BASE_URL = 'https://test.openai.com/v1';
const RESPONSES_URL = `${TEST_BASE_URL}/responses`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubEnv('OPENAI_BASE_URL', TEST_BASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});
```

Key points:
- `onUnhandledRequest: 'error'` ensures no real API calls leak through
- `vi.stubEnv` sets the OpenAI env vars without mutating `process.env` permanently
- `server.resetHandlers()` clears per-test overrides between tests

### Mocking Text Responses

Return an OpenAI Responses API format with a message output:

```typescript
server.use(
  http.post(RESPONSES_URL, () => {
    return HttpResponse.json({
      id: 'resp_test',
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model: 'test-model',
      status: 'completed',
      output_text: 'Hello!',
      output: [
        {
          type: 'message',
          id: 'msg_test',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello!', annotations: [] }],
        },
      ],
      // ... other required fields (see test helpers)
    });
  }),
);
```

### Mocking Tool Calls

Return a function_call output to simulate the model calling a tool:

```typescript
server.use(
  http.post(RESPONSES_URL, () => {
    return HttpResponse.json({
      // ...
      output_text: '',
      output: [
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'test.echo',
          arguments: JSON.stringify({ message: 'hello' }),
          status: 'completed',
        },
      ],
    });
  }),
);
```

### Sequential Responses

For multi-turn tests (tool call → text response), use a counter in the handler:

```typescript
let callCount = 0;
server.use(
  http.post(RESPONSES_URL, () => {
    callCount++;
    if (callCount === 1) {
      return HttpResponse.json(createToolCallApiResponse('test.echo', { message: 'hi' }, 'call_1'));
    }
    return HttpResponse.json(createTextApiResponse('Done'));
  }),
);
```

### Capturing Requests

To assert on what was sent to the API:

```typescript
const capturedBodies: unknown[] = [];
server.use(
  http.post(RESPONSES_URL, async ({ request }) => {
    capturedBodies.push(await request.json());
    return HttpResponse.json(createTextApiResponse('ok'));
  }),
);

// ... run completion ...

const body = capturedBodies[0] as { input: unknown[]; tools: unknown[] };
expect(body.tools).toHaveLength(2);
```

## Registering Plugins in Tests

Create a `Services` instance and register plugins before each test:

```typescript
import { Services, PluginService, createPlugin, createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

let services: Services;

beforeEach(() => {
  services = new Services();
});

it('uses a tool', async () => {
  const tool = createTool({
    id: 'test.add',
    description: 'Adds numbers',
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.object({ sum: z.number() }),
    invoke: async ({ input }) => ({ sum: input.a + input.b }),
  });

  const plugin = createPlugin({
    id: 'test',
    state: z.unknown(),
    prepare: async (prepare) => {
      prepare.tools.push(tool);
    },
  });

  await services.get(PluginService).register(plugin);

  // ... create PromptCompletion and run ...
});
```

## Writing Good Tests

Focus on high-value tests over quantity:

1. **Test the contract, not the implementation** — Assert on observable outputs (prompt state, output array, events) rather than internal method calls.

2. **Test error paths** — The agent loop recovers from tool errors by feeding them back to the model. Test that errors produce the right output format and that the loop continues.

3. **Test integration points** — The boundary between the framework and the OpenAI API is the most valuable place to test. MSW makes this testable without mocking internals.

4. **Avoid snapshot tests for API payloads** — The OpenAI API response format may change. Assert on specific fields you care about with `toMatchObject`.

5. **Keep tests independent** — Each test creates its own `Services` instance and MSW handlers. No shared mutable state between tests.
