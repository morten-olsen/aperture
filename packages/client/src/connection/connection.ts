type ClientConnectionOptions = {
  baseUrl: string;
  prefix?: string;
  userId?: string;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type StreamCallbacks = {
  onEvent: (event: string, data: unknown) => void;
  onError?: (error: Error) => void;
};

class ClientError extends Error {
  #status: number;

  constructor(message: string, status: number) {
    super(message);
    this.#status = status;
  }

  get status() {
    return this.#status;
  }
}

class ClientConnection {
  #options: ClientConnectionOptions;

  constructor(options: ClientConnectionOptions) {
    this.#options = options;
  }

  get baseUrl() {
    const prefix = this.#options.prefix ?? '/api';
    return `${this.#options.baseUrl}${prefix}`;
  }

  get headers(): Record<string, string> {
    const result: Record<string, string> = {};
    if (this.#options.userId) {
      result['X-User-Id'] = this.#options.userId;
    }
    return result;
  }

  public request = async <T>(path: string, options?: RequestOptions): Promise<T> => {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };
    if (this.#options.userId) {
      headers['X-User-Id'] = this.#options.userId;
    }

    const response = await fetch(url, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new ClientError(text, response.status);
    }

    return (await response.json()) as T;
  };

  public stream = (path: string, callbacks: StreamCallbacks): AbortController => {
    const controller = new AbortController();
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (this.#options.userId) {
      headers['X-User-Id'] = this.#options.userId;
    }

    const run = async () => {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new ClientError(text, response.status);
      }
      if (!response.body) {
        throw new ClientError('No response body', 0);
      }
      await this.#readStream(response.body, callbacks);
    };

    run().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    });

    return controller;
  };

  #readStream = async (body: ReadableStream<Uint8Array>, callbacks: StreamCallbacks) => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';
    let currentData = '';

    const dispatch = () => {
      if (currentData) {
        try {
          const parsed: unknown = JSON.parse(currentData);
          callbacks.onEvent(currentEvent, parsed);
        } catch {
          callbacks.onEvent(currentEvent, currentData);
        }
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
}

export type { ClientConnectionOptions, RequestOptions, StreamCallbacks };
export { ClientConnection, ClientError };
