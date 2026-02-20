import { useMutation, useQuery } from '@tanstack/react-query';

import type { ToolId, ToolInput, ToolOutput } from '../generated/tools.ts';

import { useAgenticClient } from './use-client.tsx';

const useToolInvoke = <T extends ToolId>(toolId: T) => {
  const client = useAgenticClient();
  return useMutation({
    mutationFn: (input: ToolInput<T>) => client.invokeTool(toolId, input),
  });
};

const useToolQuery = <T extends ToolId>(toolId: T, input: ToolInput<T>) => {
  const client = useAgenticClient();
  return useQuery<{ result: ToolOutput<T> }>({
    queryKey: ['tool', toolId, input],
    queryFn: () => client.invokeTool(toolId, input),
  });
};

export { useToolInvoke, useToolQuery };
