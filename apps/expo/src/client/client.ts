import type { ToolId, ToolInput, ToolOutput } from '../generated/tools.ts';

import { EventStream } from './client.events.ts';
import type { CreateSseConnection } from './client.sse.ts';

type AgenticClientOptions = {
  baseUrl: string;
  userId: string;
  createSseConnection: CreateSseConnection;
};

class AgenticClient {
  #baseUrl: string;
  #userId: string;
  #events: EventStream;

  constructor(options: AgenticClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#userId = options.userId;
    this.#events = new EventStream(options.createSseConnection);
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  get userId() {
    return this.#userId;
  }

  get events() {
    return this.#events;
  }

  connect = () => {
    this.#events.connect(`${this.#baseUrl}/events`, {
      'X-User-Id': this.#userId,
    });
  };

  disconnect = () => {
    this.#events.disconnect();
  };

  getCapabilities = async (): Promise<{
    plugins: { id: string; name: string; description?: string }[];
  }> => {
    return this.#fetch('/capabilities');
  };

  listTools = async (): Promise<{
    tools: {
      id: string;
      description: string;
      tag?: string;
      input: unknown;
      output: unknown;
    }[];
  }> => {
    return this.#fetch('/tools');
  };

  invokeTool = async <T extends ToolId>(toolId: T, input: ToolInput<T>): Promise<{ result: ToolOutput<T> }> => {
    return this.#fetch(`/tools/${encodeURIComponent(toolId)}/invoke`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  };

  sendPrompt = async (params: {
    input: string;
    model?: 'normal' | 'high';
    conversationId?: string;
  }): Promise<{ promptId: string }> => {
    return this.#fetch('/prompt', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  };

  approveToolCall = async (promptId: string, toolCallId: string): Promise<void> => {
    await this.#fetch(`/prompts/${encodeURIComponent(promptId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ toolCallId }),
    });
  };

  rejectToolCall = async (promptId: string, toolCallId: string, reason?: string): Promise<void> => {
    await this.#fetch(`/prompts/${encodeURIComponent(promptId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ toolCallId, reason }),
    });
  };

  #fetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this.#userId,
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  };
}

export type { AgenticClientOptions };
export { AgenticClient };
