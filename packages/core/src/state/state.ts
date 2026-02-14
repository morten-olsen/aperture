import type { z, ZodType } from 'zod';

import type { Plugin } from '../plugin/plugin.js';

type StateOptions = {
  initial: Record<string, unknown>;
};

class State {
  #states: Record<string, unknown>;

  constructor(options: StateOptions) {
    this.#states = options.initial;
  }

  public setState = <TState extends ZodType>(plugin: Plugin<TState>, state: z.input<TState>) => {
    const parsed = plugin.state.parse(state);
    this.#states[plugin.id] = parsed;
  };

  public getState = <TState extends ZodType>(plugin: Plugin<TState>) => {
    const state = this.#states[plugin.id];
    if (!state) {
      return undefined;
    }
    return plugin.state.parse(state);
  };

  public static fromInit = (initial: Record<string, unknown>) => {
    return new State({
      initial,
    });
  };
}

export { State };
