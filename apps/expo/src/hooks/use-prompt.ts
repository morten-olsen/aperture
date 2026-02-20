import { useCallback, useEffect, useRef, useState } from 'react';

import { useAgenticClient } from './use-client.tsx';

type PromptOutput = {
  type: string;
  [key: string]: unknown;
};

type ApprovalRequest = {
  promptId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  reason: string;
};

type UsePromptReturn = {
  send: (input: string, options?: { conversationId?: string; model?: 'normal' | 'high' }) => void;
  promptId: string | null;
  outputs: PromptOutput[];
  pendingApproval: ApprovalRequest | null;
  isStreaming: boolean;
  error: Error | null;
  approve: (toolCallId: string) => Promise<void>;
  reject: (toolCallId: string, reason?: string) => Promise<void>;
};

type BufferedEvent = { event: string; data: unknown };

const usePrompt = (): UsePromptReturn => {
  const client = useAgenticClient();
  const [promptId, setPromptId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<PromptOutput[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const handleEvent = useCallback((event: string, data: unknown) => {
    const payload = data as Record<string, unknown>;
    switch (event) {
      case 'prompt.output':
        setOutputs((prev) => [...prev, payload as PromptOutput]);
        break;
      case 'prompt.approval':
        setPendingApproval(payload as unknown as ApprovalRequest);
        break;
      case 'prompt.completed':
        setIsStreaming(false);
        break;
      case 'prompt.error':
        setError(new Error((payload.error as string) ?? 'Unknown error'));
        setIsStreaming(false);
        break;
    }
  }, []);

  const send = useCallback(
    async (input: string, options?: { conversationId?: string; model?: 'normal' | 'high' }) => {
      unsubscribeRef.current?.();
      setOutputs([]);
      setPendingApproval(null);
      setError(null);
      setIsStreaming(true);

      // Subscribe globally BEFORE sending so we never miss events.
      // Buffer everything until we know the promptId.
      const buffer: BufferedEvent[] = [];
      let resolvedId: string | null = null;

      const unsubGlobal = client.events.subscribeGlobal((event, data) => {
        if (!event.startsWith('prompt.')) return;
        const pid = (data as { promptId?: string })?.promptId;
        if (!pid) return;
        if (resolvedId === null) {
          buffer.push({ event, data });
        } else if (pid === resolvedId) {
          handleEvent(event, data);
        }
      });

      try {
        const { promptId: id } = await client.sendPrompt({
          input,
          model: options?.model,
          conversationId: options?.conversationId,
        });
        resolvedId = id;
        setPromptId(id);

        // Drain buffered events that match our promptId
        for (const { event, data } of buffer) {
          const pid = (data as { promptId?: string })?.promptId;
          if (pid === id) {
            handleEvent(event, data);
          }
        }

        // Switch to per-prompt subscription and drop the global one
        const unsubPrompt = client.events.subscribeToPrompt(id, handleEvent);
        unsubGlobal();

        unsubscribeRef.current = unsubPrompt;
      } catch (err) {
        unsubGlobal();
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsStreaming(false);
      }
    },
    [client, handleEvent],
  );

  const approve = useCallback(
    async (toolCallId: string) => {
      if (!promptId) return;
      await client.approveToolCall(promptId, toolCallId);
      setPendingApproval(null);
    },
    [client, promptId],
  );

  const reject = useCallback(
    async (toolCallId: string, reason?: string) => {
      if (!promptId) return;
      await client.rejectToolCall(promptId, toolCallId, reason);
      setPendingApproval(null);
    },
    [client, promptId],
  );

  return { send, promptId, outputs, pendingApproval, isStreaming, error, approve, reject };
};

export type { PromptOutput, ApprovalRequest, UsePromptReturn };
export { usePrompt };
