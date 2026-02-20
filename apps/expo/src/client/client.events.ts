import type { CreateSseConnection, SseConnection } from './client.sse.ts';

type EventHandler = (event: string, data: unknown) => void;
type PromptHandler = (event: string, data: unknown) => void;

class EventStream {
  #createConnection: CreateSseConnection;
  #connection: SseConnection | null = null;
  #connected = false;
  #url = '';
  #headers: Record<string, string> = {};
  #globalListeners = new Set<EventHandler>();
  #promptListeners = new Map<string, Set<PromptHandler>>();
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectDelay = 1000;
  #maxReconnectDelay = 30000;
  #shouldConnect = false;

  constructor(createConnection: CreateSseConnection) {
    this.#createConnection = createConnection;
  }

  get connected() {
    return this.#connected;
  }

  connect = (url: string, headers: Record<string, string>) => {
    this.#url = url;
    this.#headers = headers;
    this.#shouldConnect = true;
    this.#doConnect();
  };

  disconnect = () => {
    this.#shouldConnect = false;
    this.#clearReconnect();
    if (this.#connection) {
      this.#connection.close();
      this.#connection = null;
    }
    this.#connected = false;
  };

  subscribeGlobal = (handler: EventHandler): (() => void) => {
    this.#globalListeners.add(handler);
    return () => this.#globalListeners.delete(handler);
  };

  subscribeToPrompt = (promptId: string, handler: PromptHandler): (() => void) => {
    let set = this.#promptListeners.get(promptId);
    if (!set) {
      set = new Set();
      this.#promptListeners.set(promptId, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.#promptListeners.delete(promptId);
      }
    };
  };

  #doConnect = () => {
    this.#clearReconnect();
    if (this.#connection) {
      this.#connection.close();
      this.#connection = null;
    }

    this.#connection = this.#createConnection(this.#url, this.#headers, {
      onOpen: () => {
        this.#connected = true;
        this.#reconnectDelay = 1000;
      },
      onEvent: (event, rawData) => {
        let data: unknown;
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData;
        }

        for (const listener of this.#globalListeners) {
          listener(event, data);
        }

        const promptId = (data as { promptId?: string })?.promptId;
        if (promptId) {
          const handlers = this.#promptListeners.get(promptId);
          if (handlers) {
            for (const handler of handlers) {
              handler(event, data);
            }
          }
        }
      },
      onError: () => {
        this.#connected = false;
        this.#scheduleReconnect();
      },
    });
  };

  #scheduleReconnect = () => {
    if (!this.#shouldConnect) return;
    this.#clearReconnect();
    this.#reconnectTimer = setTimeout(() => {
      this.#doConnect();
    }, this.#reconnectDelay);
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, this.#maxReconnectDelay);
  };

  #clearReconnect = () => {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  };
}

export type { EventHandler, PromptHandler };
export { EventStream };
