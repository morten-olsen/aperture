import type { CreateSseConnection } from '@morten-olsen/agentic-client';
import EventSource from 'react-native-sse';

const createSseConnection: CreateSseConnection = (url, headers, callbacks) => {
  const es = new EventSource(url, { headers });

  es.addEventListener('open', () => {
    callbacks.onOpen();
  });

  es.addEventListener('error', (event) => {
    const message = (event as { message?: string }).message ?? 'SSE connection error';
    callbacks.onError(new Error(message));
  });

  // Server sends all events without a named type, so they arrive as 'message'
  es.addEventListener('message', (event) => {
    const data = (event as { data?: string }).data;
    if (data) {
      callbacks.onEvent('message', data);
    }
  });

  return {
    close: () => es.close(),
  };
};

export { createSseConnection };
