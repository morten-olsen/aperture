import type { ZodType } from 'zod';

import type { Context } from '../context/context.js';
import type { State } from '../state/state.js';
import type { Tool } from '../tool/tool.js';
import type { Services } from '../utils/utils.service.js';
import type { Prompt } from '../prompt/prompt.js';

type PluginPrepareOptions = {
  userId: string;
  context: Context;
  prompts: Prompt[];
  tools: Tool<ZodType, ZodType>[];
  services: Services;
  state: State;
};

class PluginPrepare {
  #userId: string;
  #services: Services;
  #context: Context;
  #prompts: Prompt[];
  #tools: Tool<ZodType, ZodType>[];
  #state: State;

  constructor(options: PluginPrepareOptions) {
    this.#userId = options.userId;
    this.#services = options.services;
    this.#context = options.context;
    this.#prompts = options.prompts;
    this.#tools = options.tools;
    this.#state = options.state;
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

export { PluginPrepare };
