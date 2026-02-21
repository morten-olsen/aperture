import EventSource from 'react-native-sse';

import { knownEventIds } from '../generated/events.ts';

import type { CreateSseConnection } from './client.sse.ts';

const createSseConnection: CreateSseConnection = (url, headers, callbacks) => {
  const es = new EventSource(url, { headers });

  es.addEventListener('open', () => {
    callbacks.onOpen();
  });

  es.addEventListener('error', (event) => {
    const message = (event as { message?: string }).message ?? 'SSE connection error';
    callbacks.onError(new Error(message));
  });

  // react-native-sse dispatches named events directly
  const originalOnEvent = callbacks.onEvent;
  const knownEvents = ['connected', ...knownEventIds];

  for (const eventName of knownEvents) {
    es.addEventListener(eventName, (event) => {
      const data = (event as { data?: string }).data;
      if (data) {
        originalOnEvent(eventName, data);
      }
    });
  }

  return {
    close: () => es.close(),
  };
};

export { createSseConnection };
