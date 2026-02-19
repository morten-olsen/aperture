import {
  type QuickJSAsyncContext,
  type QuickJSContext,
  type QuickJSHandle,
  RELEASE_ASYNC,
  Scope,
  newQuickJSAsyncWASMModule,
} from 'quickjs-emscripten';

import type { RunCodeInput } from '../schemas/schemas.js';

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

  public execute = async (input: RunCodeInput): Promise<unknown> => {
    const QuickJS = await this.#engine;
    const runtime = QuickJS.newRuntime();
    const modules = this.#modules;

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

      // Expose host methods with automatic marshalling (supports async)
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

      const resultHandle = scope.manage(vm.unwrapResult(await (vm as QuickJSAsyncContext).evalCodeAsync(input.code)));
      return vm.dump(resultHandle);
    } finally {
      scope.dispose();
    }
  };
}

export { InterpreterService };
export type { ExposedMethod };
