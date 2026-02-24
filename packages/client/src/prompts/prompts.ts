import type { ClientConnection } from '../connection/connection.js';

type ClientPromptsOptions = {
  connection: ClientConnection;
};

type CreatePromptInput = {
  input: string;
  model?: 'normal' | 'high';
  mode?: string;
  conversationId?: string;
};

type ApprovePromptInput = {
  toolCallId: string;
};

type RejectPromptInput = {
  toolCallId: string;
  reason?: string;
};

class ClientPrompts {
  #options: ClientPromptsOptions;

  constructor(options: ClientPromptsOptions) {
    this.#options = options;
  }

  public create = async (input: CreatePromptInput) => {
    return this.#options.connection.request<{ promptId: string }>('/prompt', {
      method: 'POST',
      body: input,
    });
  };

  public approve = async (promptId: string, input: ApprovePromptInput) => {
    return this.#options.connection.request<{ approved: boolean }>(`/prompts/${promptId}/approve`, {
      method: 'POST',
      body: input,
    });
  };

  public reject = async (promptId: string, input: RejectPromptInput) => {
    return this.#options.connection.request<{ rejected: boolean }>(`/prompts/${promptId}/reject`, {
      method: 'POST',
      body: input,
    });
  };
}

export type { CreatePromptInput, ApprovePromptInput, RejectPromptInput };
export { ClientPrompts };
