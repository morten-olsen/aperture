import type { ClientConnection } from '../connection/connection.js';

type ClientToolsOptions = {
  connection: ClientConnection;
};

type ClientToolDirectory = Record<
  string,
  {
    input: unknown;
    output: unknown;
  }
>;

class ClientTools<TTools extends ClientToolDirectory = ClientToolDirectory> {
  #options: ClientToolsOptions;

  constructor(options: ClientToolsOptions) {
    this.#options = options;
  }

  public invoke = async <TName extends keyof TTools & string>(
    name: TName,
    input: TTools[TName]['input'],
  ): Promise<TTools[TName]['output']> => {
    const response = await this.#options.connection.request<{ result: TTools[TName]['output'] }>(
      `/tools/${name}/invoke`,
      { method: 'POST', body: input },
    );
    return response.result;
  };

  public list = async () => {
    const response = await this.#options.connection.request<{ tools: unknown[] }>('/tools');
    return response.tools;
  };
}

export type { ClientToolDirectory };
export { ClientTools };
