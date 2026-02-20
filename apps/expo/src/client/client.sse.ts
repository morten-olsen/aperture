type SseCallbacks = {
  onEvent: (event: string, data: string) => void;
  onError: (error: Error) => void;
  onOpen: () => void;
};

type SseConnection = {
  close(): void;
};

type CreateSseConnection = (url: string, headers: Record<string, string>, callbacks: SseCallbacks) => SseConnection;

export type { SseCallbacks, SseConnection, CreateSseConnection };
