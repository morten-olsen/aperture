import type { z, ZodType } from 'zod';

import type { Services } from '../utils/utils.service.js';

import type { Plugin } from './plugin.js';

type PluginInstance = {
  plugin: Plugin<ZodType, ZodType>;
  config: unknown;
};

class PluginService {
  #services: Services;
  #plugins: Map<string, PluginInstance>;

  constructor(services: Services) {
    this.#services = services;
    this.#plugins = new Map();
  }

  public register = async <TConfig extends ZodType>(plugin: Plugin<ZodType, TConfig>, config: z.infer<TConfig>) => {
    this.#plugins.set(plugin.id, {
      plugin: plugin as Plugin<ZodType, ZodType>,
      config,
    });
    await plugin.setup?.({
      config,
      services: this.#services,
      secrets: this.#services.secrets,
    });
  };

  public has = (plugin: string | Plugin<ZodType>) => {
    return this.#plugins.has(typeof plugin === 'string' ? plugin : plugin.id);
  };

  public getConfig = (plugin: string | Plugin<ZodType>) => {
    const instance = this.#plugins.get(typeof plugin === 'string' ? plugin : plugin.id);
    return instance?.config;
  };

  public start = async () => {
    for (const [, { plugin, config }] of this.#plugins) {
      await plugin.ready?.({
        config,
        services: this.#services,
        secrets: this.#services.secrets,
      });
    }
  };

  public toArray = () => {
    return Array.from(this.#plugins);
  };
}

export { PluginService };
