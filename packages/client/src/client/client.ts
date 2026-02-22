import { ClientConnection, type ClientConnectionOptions } from '../connection/connection.js';
import { ClientEvents, type ClientEventsDirectory, type CreateSseConnection } from '../events/events.js';
import { ClientPrompts } from '../prompts/prompts.js';
import { type ClientToolDirectory, ClientTools } from '../tools/tools.js';

type ServerDefinition = {
  tools: ClientToolDirectory;
  events: ClientEventsDirectory;
};

type ApertureClientOptions = ClientConnectionOptions & {
  createSseConnection?: CreateSseConnection;
};

class ApertureClient<TServerDefinition extends ServerDefinition = ServerDefinition> {
  #events?: ClientEvents<TServerDefinition['events']>;
  #tools?: ClientTools<TServerDefinition['tools']>;
  #prompts?: ClientPrompts;
  #connection: ClientConnection;
  #createSseConnection?: CreateSseConnection;

  constructor(options: ApertureClientOptions) {
    this.#connection = new ClientConnection(options);
    this.#createSseConnection = options.createSseConnection;
  }

  public get connection() {
    return this.#connection;
  }

  public get events() {
    if (!this.#events) {
      this.#events = new ClientEvents({
        connection: this.#connection,
        createSseConnection: this.#createSseConnection,
      });
    }
    return this.#events;
  }

  public get tools() {
    if (!this.#tools) {
      this.#tools = new ClientTools({
        connection: this.#connection,
      });
    }
    return this.#tools;
  }

  public get prompts() {
    if (!this.#prompts) {
      this.#prompts = new ClientPrompts({
        connection: this.#connection,
      });
    }
    return this.#prompts;
  }

  public close = () => {
    this.#events?.close();
  };
}

export type { ServerDefinition, ApertureClientOptions };
export { ApertureClient };
