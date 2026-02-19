import type { Config } from '../config/config.js';
import { SecretsProviderMemory, type SecretsProvider } from '../secrets/secrets.js';

const destroy = Symbol('destroy');
const instanceKey = Symbol('instances');

type ServiceDependency<T> = new (services: Services) => T & {
  [destroy]?: () => Promise<void> | void;
};

class Services {
  #config: Config;
  #secrets: SecretsProvider;
  [instanceKey]: Map<ServiceDependency<unknown>, unknown>;

  constructor(config: Config) {
    this.#config = config;
    this.#secrets = config.secrets || new SecretsProviderMemory();
    this[instanceKey] = new Map();
  }

  public get config() {
    return this.#config;
  }

  public get secrets(): SecretsProvider {
    return this.#secrets;
  }

  public get = <T>(service: ServiceDependency<T>) => {
    if (!this[instanceKey].has(service)) {
      this[instanceKey].set(service, new service(this));
    }
    const instance = this[instanceKey].get(service);
    if (!instance) {
      throw new Error('Could not generate instance');
    }
    return instance as T;
  };

  public set = <T>(service: ServiceDependency<T>, instance: Partial<T>) => {
    this[instanceKey].set(service, instance);
  };

  public destroy = async () => {
    await Promise.all(
      this[instanceKey].values().map(async (instance) => {
        if (
          typeof instance === 'object' &&
          instance &&
          destroy in instance &&
          typeof instance[destroy] === 'function'
        ) {
          await instance[destroy]();
        }
      }),
    );
  };

  public static mock = () => {
    return new Services({
      provider: {
        apiKey: 'test-key',
        baseUrl: 'https://test.openai.com/v1',
      },
      models: {
        normal: 'test-model',
        high: 'test-model-high',
      },
    });
  };
}

export { Services, destroy };
