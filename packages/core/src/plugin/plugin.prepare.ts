import type { z, ZodType, ZodUnknown } from 'zod';

import type { Context } from '../context/context.js';
import type { State } from '../state/state.js';
import type { Tool } from '../tool/tool.js';
import type { Services } from '../utils/utils.service.js';
import type { Prompt } from '../prompt/prompt.js';

type PluginPrepareContextOptions = {
  userId: string;
  context: Context;
  prompts: Prompt[];
  tools: Tool<ZodType, ZodType>[];
  services: Services;
  state: State;
};

class PluginPrepareContext {
  #userId: string;
  #services: Services;
  #context: Context;
  #prompts: Prompt[];
  #tools: Tool<ZodType, ZodType>[];
  #state: State;

  constructor(options: PluginPrepareContextOptions) {
    this.#userId = options.userId;
    this.#services = options.services;
    this.#context = options.context;
    this.#prompts = options.prompts;
    this.#tools = options.tools;
    this.#state = options.state;
  }

  public forPlugin = <TConfig extends ZodType = ZodUnknown>(config: z.infer<TConfig>): PluginPrepare<TConfig> => {
    return new PluginPrepare({
      userId: this.#userId,
      context: this.#context,
      prompts: this.#prompts,
      tools: this.#tools,
      state: this.#state,
      services: this.#services,
      config,
    });
  };

  public get userId() {
    return this.#userId;
  }

  public get context() {
    return this.#context;
  }

  public get prompts() {
    return this.#prompts;
  }

  public get tools() {
    return this.#tools;
  }

  public get state() {
    return this.#state;
  }

  public get services() {
    return this.#services;
  }
}

type PluginPrepareOptions<TConfig extends ZodType = ZodUnknown> = {
  userId: string;
  context: Context;
  prompts: Prompt[];
  tools: Tool<ZodType, ZodType>[];
  services: Services;
  state: State;
  config: z.infer<TConfig>;
};

class PluginPrepare<TConfig extends ZodType = ZodUnknown> {
  #userId: string;
  #services: Services;
  #context: Context;
  #prompts: Prompt[];
  #tools: Tool<ZodType, ZodType>[];
  #state: State;
  #config: z.infer<TConfig>;

  constructor(options: PluginPrepareOptions<TConfig>) {
    this.#userId = options.userId;
    this.#services = options.services;
    this.#context = options.context;
    this.#prompts = options.prompts;
    this.#tools = options.tools;
    this.#state = options.state;
    this.#config = options.config;
  }

  public get config(): z.infer<TConfig> {
    return this.#config;
  }

  public get userId() {
    return this.#userId;
  }

  public get context() {
    return this.#context;
  }

  public get prompts() {
    return this.#prompts;
  }

  public get tools() {
    return this.#tools;
  }

  public get state() {
    return this.#state;
  }

  public get services() {
    return this.#services;
  }

  public get secrets() {
    return this.services.secrets;
  }
}

export { PluginPrepare, PluginPrepareContext };
