import { describe, expect, it } from 'vitest';

import { InterpreterService } from './service.js';

describe('InterpreterService', () => {
  it('should execute simple code and return a value', async () => {
    const service = new InterpreterService();
    const result = await service.execute({
      code: '1 + 2',
    });
    expect(result).toBe(3);
  });

  it('should provide the input variable', async () => {
    const service = new InterpreterService();
    const result = await service.execute({
      code: 'input.a + input.b',
      input: { a: 10, b: 20 },
    });
    expect(result).toBe(30);
  });

  it('should marshal complex input', async () => {
    const service = new InterpreterService();
    const result = await service.execute({
      code: 'input',
      input: { nums: [1, 2, 3], nested: { ok: true }, empty: null },
    });
    expect(result).toEqual({ nums: [1, 2, 3], nested: { ok: true }, empty: null });
  });

  it('should expose host methods with auto-marshalling', async () => {
    const service = new InterpreterService();
    service.expose({ name: 'add', description: 'add two numbers', fn: (a, b) => (a as number) + (b as number) });
    const result = await service.execute({
      code: 'add(3, 4)',
    });
    expect(result).toBe(7);
  });

  it('should marshal host method return values', async () => {
    const service = new InterpreterService();
    service.expose({
      name: 'getUser',
      description: 'get a user',
      fn: () => ({ name: 'Alice', tags: ['admin', 'user'] }),
    });
    const result = await service.execute({
      code: 'getUser()',
    });
    expect(result).toEqual({ name: 'Alice', tags: ['admin', 'user'] });
  });

  it('should isolate executions', async () => {
    const service = new InterpreterService();
    await service.execute({
      code: 'globalThis.leaked = 42',
    });
    const result = await service.execute({
      code: 'typeof globalThis.leaked',
    });
    expect(result).toBe('undefined');
  });

  it('should return error object on invalid code', async () => {
    const service = new InterpreterService();
    const result = await service.execute({ code: 'throw new Error("boom")' });
    expect(result).toMatchObject({ error: 'boom', line: 1, column: 16 });
  });

  it('should not have access to fetch, filesystem, or network APIs', async () => {
    const service = new InterpreterService();
    const result = await service.execute({
      code: `({
        fetch: typeof fetch,
        XMLHttpRequest: typeof XMLHttpRequest,
        require: typeof require,
        process: typeof process,
      })`,
    });
    expect(result).toEqual({
      fetch: 'undefined',
      XMLHttpRequest: 'undefined',
      require: 'undefined',
      process: 'undefined',
    });
  });

  it('should return error for unregistered module imports', async () => {
    const service = new InterpreterService();
    const result = await service.execute({ code: `import fs from 'fs'; fs` });
    expect(result).toMatchObject({ error: 'Module not found: fs' });
  });

  it('should support async exposed methods', async () => {
    const service = new InterpreterService();
    service.expose({
      name: 'fetchData',
      description: 'fetch data from a URL',
      fn: async (url) => {
        // Simulate an async fetch
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { status: 200, body: `response from ${url}` };
      },
    });
    const result = await service.execute({
      code: `fetchData("https://example.com")`,
    });
    expect(result).toEqual({ status: 200, body: 'response from https://example.com' });
  });

  it('should support importing registered modules', async () => {
    const service = new InterpreterService();
    service.addModule('math-utils', 'export const double = (n) => n * 2;');
    const result = await service.execute({
      code: `
        import { double } from 'math-utils';
        export default double(21);
      `,
    });
    expect(result).toEqual({ default: 42 });
  });

  it('should timeout on infinite loops', async () => {
    const service = new InterpreterService();
    const result = await service.execute({ code: 'while(true) {}', timeout: 100 });
    expect(result).toMatchObject({ error: 'Execution timed out after 100ms', timeout: true });
  });

  it('should include line and column in error context', async () => {
    const service = new InterpreterService();
    const result = await service.execute({
      code: `const x = 1;
const y = 2;
const z = unknownVar;
z`,
    });
    expect(result).toMatchObject({
      error: "'unknownVar' is not defined",
      line: 3,
      column: 11,
      context: 'const z = unknownVar;',
    });
  });
});
