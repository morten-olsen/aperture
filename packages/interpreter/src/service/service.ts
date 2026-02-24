import {
  type QuickJSAsyncContext,
  type QuickJSContext,
  type QuickJSHandle,
  RELEASE_ASYNC,
  Scope,
  newQuickJSAsyncWASMModule,
} from 'quickjs-emscripten';

import type { RunCodeInput } from '../schemas/schemas.js';

type ExecuteOptions = RunCodeInput & {
  evalType?: 'global' | 'module';
  timeout?: number; // milliseconds, default 30000
};

type ExecutionError = {
  error: string;
  line?: number;
  column?: number;
  context?: string;
};

const DEFAULT_TIMEOUT = 30000;

const parseErrorLocation = (text: string, code: string): { line?: number; column?: number; context?: string } => {
  // QuickJS stack format: "at <eval> (eval.js:3:11)" or message format "eval.js:3:5"
  const match = text.match(/eval\.js:(\d+)(?::(\d+))?/);
  if (!match) return {};

  const line = parseInt(match[1], 10);
  const column = match[2] ? parseInt(match[2], 10) : undefined;
  const lines = code.split('\n');
  const context = line > 0 && line <= lines.length ? lines[line - 1].trim() : undefined;

  return { line, column, context };
};

class TimeoutError extends Error {
  constructor(timeout: number) {
    super(`Execution timed out after ${timeout}ms`);
    this.name = 'TimeoutError';
  }
}

type ExposedMethod = (...args: unknown[]) => unknown | Promise<unknown>;

type ExposedMethodEntry = {
  fn: ExposedMethod;
  description: string;
};

const marshal = (vm: QuickJSContext, scope: Scope, value: unknown): QuickJSHandle => {
  if (value === null || value === undefined) {
    return value === null ? vm.null : vm.undefined;
  }
  if (typeof value === 'boolean') {
    return value ? vm.true : vm.false;
  }
  if (typeof value === 'number') {
    return scope.manage(vm.newNumber(value));
  }
  if (typeof value === 'string') {
    return scope.manage(vm.newString(value));
  }
  if (Array.isArray(value)) {
    const arr = scope.manage(vm.newArray());
    for (let i = 0; i < value.length; i++) {
      const element = marshal(vm, scope, value[i]);
      vm.setProp(arr, i, element);
    }
    return arr;
  }
  if (typeof value === 'object') {
    const obj = scope.manage(vm.newObject());
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const propValue = marshal(vm, scope, val);
      vm.setProp(obj, key, propValue);
    }
    return obj;
  }
  return vm.undefined;
};

class InterpreterService {
  #engine = newQuickJSAsyncWASMModule(RELEASE_ASYNC);
  #methods: Record<string, ExposedMethodEntry> = {};
  #modules: Record<string, string> = {};

  // eslint-disable-next-line
  public expose = (options: { name: string; description: string; fn: (...args: any[]) => unknown }) => {
    const { name, description, fn } = options;
    this.#methods[name] = { fn, description };
  };

  public addModule = (name: string, source: string) => {
    this.#modules[name] = source;
  };

  public get methodDocs(): { name: string; description: string }[] {
    return Object.entries(this.#methods).map(([name, entry]) => ({
      name,
      description: entry.description,
    }));
  }

  public get moduleNames(): string[] {
    return Object.keys(this.#modules);
  }

  public clone = (): InterpreterService => {
    const copy = new InterpreterService();
    copy.#methods = { ...this.#methods };
    copy.#modules = { ...this.#modules };
    return copy;
  };

  public execute = async (input: ExecuteOptions): Promise<unknown> => {
    const timeout = input.timeout ?? DEFAULT_TIMEOUT;
    const QuickJS = await this.#engine;
    const runtime = QuickJS.newRuntime();
    const modules = this.#modules;

    // Set up interrupt handler for timeout
    let interrupted = false;
    const startTime = Date.now();
    runtime.setInterruptHandler(() => {
      if (Date.now() - startTime > timeout) {
        interrupted = true;
        return true; // Interrupt execution
      }
      return false;
    });

    runtime.setModuleLoader((moduleName) => {
      const source = modules[moduleName];
      if (source) {
        return source;
      }
      return { error: new Error(`Module not found: ${moduleName}`) };
    });

    using vm = runtime.newContext();

    const scope = new Scope();
    try {
      // Expose the input variable
      const inputHandle = marshal(vm, scope, input.input ?? null);
      vm.setProp(vm.global, 'input', inputHandle);

      // Expose host methods with automatic marshalling (supports async via asyncify)
      // Note: These functions appear synchronous to the sandbox but suspend internally
      // for async operations. Do NOT use explicit 'await' in sandbox code.
      for (const [name, { fn }] of Object.entries(this.#methods)) {
        const fnHandle = scope.manage(
          (vm as QuickJSAsyncContext).newAsyncifiedFunction(name, async (...argHandles: QuickJSHandle[]) => {
            const args = argHandles.map((h) => vm.dump(h));
            const result = await fn(...args);
            return marshal(vm, scope, result);
          }),
        );
        vm.setProp(vm.global, name, fnHandle);
      }

      // Use module mode only for actual imports (not for await - asyncify handles that transparently)
      const needsModule = input.evalType === 'module' || /\bimport\s/.test(input.code);
      const evalOptions = needsModule ? { type: 'module' as const } : undefined;

      const evalResult = await (vm as QuickJSAsyncContext).evalCodeAsync(input.code, 'eval.js', evalOptions);

      // Check if we were interrupted by timeout
      if (interrupted) {
        return {
          error: `Execution timed out after ${timeout}ms`,
          timeout: true,
        } as ExecutionError & { timeout: boolean };
      }

      // Handle error results with enhanced info
      if (evalResult.error) {
        const errorHandle = evalResult.error;
        const errorObj = vm.dump(errorHandle) as { name?: string; message?: string; stack?: string };

        // Try to get stack for line info
        const stackHandle = vm.getProp(errorHandle, 'stack');
        const stack = vm.dump(stackHandle) as string | undefined;
        stackHandle.dispose();
        errorHandle.dispose();

        const message = errorObj.message ?? String(errorObj);
        const location = parseErrorLocation(stack ?? message, input.code);
        return { error: message, ...location } as ExecutionError;
      }

      const resultHandle = scope.manage(evalResult.value);
      return vm.dump(resultHandle);
    } catch (error) {
      // Handle unexpected exceptions
      if (error instanceof Error) {
        const location = parseErrorLocation(error.stack ?? error.message, input.code);
        return { error: error.message, ...location } as ExecutionError;
      }
      return { error: String(error) } as ExecutionError;
    } finally {
      scope.dispose();
    }
  };
}

export { InterpreterService, TimeoutError };
export type { ExposedMethod, ExecuteOptions, ExecutionError };
