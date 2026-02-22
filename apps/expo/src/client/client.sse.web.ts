import type { CreateSseConnection } from '@morten-olsen/agentic-client';
import { EventSourceParserStream } from 'eventsource-parser/stream';

const createSseConnection: CreateSseConnection = (url, headers, callbacks) => {
  const abortController = new AbortController();

  const run = async () => {
    const response = await fetch(url, {
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
      callbacks.onError(new Error(`SSE connection failed: ${response.status}`));
      return;
    }

    callbacks.onOpen();

    const stream = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.event && value.data) {
        callbacks.onEvent(value.event, value.data);
      }
    }
  };

  run().catch((error: unknown) => {
    if (abortController.signal.aborted) return;
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    close: () => abortController.abort(),
  };
};

export { createSseConnection };
