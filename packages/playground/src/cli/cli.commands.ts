import type { ApertureClient } from '@morten-olsen/agentic-client';

const write = (data: unknown) => {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
};

const tools = async (client: ApertureClient) => {
  const result = await client.tools.list();
  write({ tools: result });
};

const toolSchema = async (client: ApertureClient, toolId: string) => {
  const allTools = (await client.tools.list()) as {
    id: string;
    description?: string;
    input?: unknown;
    output?: unknown;
  }[];
  const tool = allTools.find((t) => t.id === toolId);
  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`);
  }
  write({ id: tool.id, description: tool.description, input: tool.input, output: tool.output });
};

const invoke = async (client: ApertureClient, toolId: string, jsonInput?: string) => {
  const input: unknown = jsonInput ? JSON.parse(jsonInput) : {};
  const result = await client.tools.invoke(toolId, input);
  write({ result });
};

const capabilities = async (client: ApertureClient) => {
  const result = await client.connection.request<unknown>('/capabilities');
  write(result);
};

type PromptOptions = {
  conversationId?: string;
  mode?: string;
};

const prompt = async (client: ApertureClient, message: string, options: PromptOptions) => {
  const { promptId } = await client.prompts.create({
    input: message,
    conversationId: options.conversationId,
    mode: options.mode,
  });
  process.stderr.write(`promptId: ${promptId}\n`);

  client.events.connect();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        cleanup();
        reject(new Error('Prompt timed out after 5 minutes'));
      },
      5 * 60 * 1000,
    );

    const cleanup = () => {
      clearTimeout(timeout);
      unsub();
      client.close();
    };

    const unsub = client.events.subscribeToPrompt(promptId, (event, data) => {
      process.stdout.write(JSON.stringify({ event, data }) + '\n');
      if (event === 'prompt.completed' || event === 'prompt.error') {
        cleanup();
        resolve();
      }
    });
  });
};

export { tools, toolSchema, invoke, capabilities, prompt };
