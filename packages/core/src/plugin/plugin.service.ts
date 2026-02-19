import type { ZodType } from 'zod';

import type { Services } from '../utils/utils.service.js';

import type { Plugin } from './plugin.js';

class PluginService {
  #services: Services;
  #plugins: Set<Plugin<ZodType>>;

  constructor(services: Services) {
    this.#services = services;
    this.#plugins = new Set();
  }

  public register = async (...plugins: Plugin<ZodType>[]) => {
    for (const plugin of plugins) {
      this.#plugins.add(plugin);
      await plugin.setup?.({
        services: this.#services,
        secrets: this.#services.secrets,
      });
    }
  };

  public has = (plugin: Plugin<ZodType>) => {
    return this.#plugins.has(plugin);
  };

  public toArray = () => {
    return Array.from(this.#plugins);
  };
}

export { PluginService };
