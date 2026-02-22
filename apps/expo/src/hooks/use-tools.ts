import { useMutation, useQuery } from '@tanstack/react-query';

import type { ToolId, ToolInput, ToolOutput } from '../generated/tools.ts';

import { useAgenticClient } from './use-client.tsx';

const invokeTool = async <T extends ToolId>(
  client: { connection: { request: <R>(path: string, options?: { method?: string; body?: unknown }) => Promise<R> } },
  toolId: T,
  input: ToolInput<T>,
): Promise<ToolOutput<T>> => {
  const response = await client.connection.request<{ result: ToolOutput<T> }>(
    `/tools/${encodeURIComponent(toolId)}/invoke`,
    { method: 'POST', body: input },
  );
  return response.result;
};

const useToolInvoke = <T extends ToolId>(toolId: T) => {
  const client = useAgenticClient();
  return useMutation({
    mutationFn: (input: ToolInput<T>) => invokeTool(client, toolId, input),
  });
};

const useToolQuery = <T extends ToolId>(toolId: T, input: ToolInput<T>) => {
  const client = useAgenticClient();
  return useQuery<ToolOutput<T>>({
    queryKey: ['tool', toolId, input],
    queryFn: () => invokeTool(client, toolId, input),
  });
};

export { useToolInvoke, useToolQuery };
