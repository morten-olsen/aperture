import { createConnection, createLongLivedTokenAuth, subscribeEntities } from 'home-assistant-js-websocket';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';

type ConnectOptions = {
  url: string;
  token: string;
};

class HomeAssistantService {
  #connection?: Connection;

  connect = async ({ url, token }: ConnectOptions) => {
    const auth = createLongLivedTokenAuth(url, token);
    this.#connection = await createConnection({ auth });
  };

  subscribeEntities = (callback: (entities: HassEntities) => void) => {
    if (!this.#connection) {
      throw new Error('HomeAssistantService: not connected');
    }
    return subscribeEntities(this.#connection, callback);
  };
}

export { HomeAssistantService };
export type { ConnectOptions };
