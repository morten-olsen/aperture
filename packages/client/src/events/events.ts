import type { ClientConnection } from '../connection/connection.js';

type SseCallbacks = {
  onEvent: (event: string, data: string) => void;
  onError: (error: Error) => void;
  onOpen: () => void;
};

type SseConnection = {
  close(): void;
};

type CreateSseConnection = (url: string, headers: Record<string, string>, callbacks: SseCallbacks) => SseConnection;

type EventHandler = (event: string, data: unknown) => void;
type PromptHandler = (event: string, data: unknown) => void;

type ClientEventsDirectory = Record<
  string,
  {
    schema: unknown;
  }
>;

type ClientEventsOptions = {
  connection: ClientConnection;
  createSseConnection?: CreateSseConnection;
};

const createFetchSseConnection: CreateSseConnection = (url, headers, callbacks) => {
  const controller = new AbortController();

  const run = async () => {
    const response = await fetch(url, {
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      callbacks.onError(new Error(`SSE connection failed: ${response.status}`));
      return;
    }

    callbacks.onOpen();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';
    let currentData = '';

    const dispatch = () => {
      if (currentData) {
        callbacks.onEvent(currentEvent, currentData);
      }
      currentEvent = 'message';
      currentData = '';
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          dispatch();
        } else if (line.startsWith(':')) {
          // comment / keepalive — ignore
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData += line.slice(5).trim();
        }
      }
    }

    if (currentData) {
      dispatch();
    }
  };

  run().catch((error: unknown) => {
    if (controller.signal.aborted) return;
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    close: () => controller.abort(),
  };
};

class ClientEvents<TEvents extends ClientEventsDirectory = ClientEventsDirectory> {
  #options: ClientEventsOptions;
  #createConnection: CreateSseConnection;
  #connection: SseConnection | null = null;
  #connected = false;
  #shouldConnect = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectDelay = 1000;
  #maxReconnectDelay = 30000;
  #nameListeners: Map<string, Set<(data: unknown) => void>>;
  #globalListeners = new Set<EventHandler>();
  #promptListeners = new Map<string, Set<PromptHandler>>();

  constructor(options: ClientEventsOptions) {
    this.#options = options;
    this.#createConnection = options.createSseConnection ?? createFetchSseConnection;
    this.#nameListeners = new Map();
  }

  get connected() {
    return this.#connected;
  }

  connect = () => {
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

  #doConnect = () => {
    this.#clearReconnect();
    if (this.#connection) {
      this.#connection.close();
      this.#connection = null;
    }

    const url = `${this.#options.connection.baseUrl}/events/stream`;
    const headers = this.#options.connection.headers;

    this.#connection = this.#createConnection(url, headers, {
      onOpen: () => {
        this.#connected = true;
        this.#reconnectDelay = 1000;
      },
      onEvent: (_rawEvent, rawData) => {
        let event: string;
        let data: unknown;
        try {
          const parsed = JSON.parse(rawData);
          if (typeof parsed === 'object' && parsed !== null && typeof parsed.event === 'string' && 'data' in parsed) {
            event = parsed.event;
            data = parsed.data;
          } else {
            event = _rawEvent;
            data = parsed;
          }
        } catch {
          event = _rawEvent;
          data = rawData;
        }

        // Name-based listeners
        const nameSet = this.#nameListeners.get(event);
        if (nameSet) {
          for (const listener of nameSet) {
            listener(data);
          }
        }

        // Global listeners
        for (const listener of this.#globalListeners) {
          listener(event, data);
        }

        // Prompt-specific listeners
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

  #ensureConnection = () => {
    if (!this.#shouldConnect) {
      this.connect();
    }
  };

  public listen = <TName extends keyof TEvents & string>(
    name: TName,
    callback: (data: TEvents[TName]['schema']) => void,
  ): (() => void) => {
    this.#ensureConnection();
    let set = this.#nameListeners.get(name);
    if (!set) {
      set = new Set();
      this.#nameListeners.set(name, set);
    }
    const handler = callback as (data: unknown) => void;
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.#nameListeners.delete(name);
      }
    };
  };

  public subscribeGlobal = (handler: EventHandler): (() => void) => {
    this.#globalListeners.add(handler);
    return () => this.#globalListeners.delete(handler);
  };

  public subscribeToPrompt = (promptId: string, handler: PromptHandler): (() => void) => {
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

  public list = async () => {
    const response = await this.#options.connection.request<{ events: unknown[] }>('/events');
    return response.events;
  };

  public close = () => {
    this.disconnect();
  };
}

export type { ClientEventsDirectory, CreateSseConnection, SseCallbacks, SseConnection, EventHandler, PromptHandler };
export { ClientEvents };
