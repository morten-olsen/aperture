import type { z, ZodType } from 'zod';

import type { Services } from '../utils/utils.service.js';

import type { Event, EventListener, EventListenerOptions, EventOptions } from './event.types.js';

type WildcardListener = (eventId: string, data: unknown, options: EventOptions) => void;
type EventRegisteredCallback = (event: Event) => void;

class EventService {
  #events: Map<string, Event>;
  #listeners: Record<string, EventListener[]>;
  #wildcardListeners: Set<WildcardListener>;
  #onRegisteredCallbacks: Set<EventRegisteredCallback>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_services: Services) {
    this.#events = new Map();
    this.#listeners = {};
    this.#wildcardListeners = new Set();
    this.#onRegisteredCallbacks = new Set();
  }

  public getEvents = (): Event[] => {
    return [...this.#events.values()];
  };

  public onEventRegistered = (cb: EventRegisteredCallback): (() => void) => {
    this.#onRegisteredCallbacks.add(cb);
    return () => {
      this.#onRegisteredCallbacks.delete(cb);
    };
  };

  public registerEvent = (...events: Event[]) => {
    for (const event of events) {
      this.#events.set(event.id, event);
      for (const cb of this.#onRegisteredCallbacks) {
        cb(event);
      }
    }
  };

  public listen = <TSchema extends ZodType = ZodType>(
    event: Event<TSchema>,
    listener: EventListener<TSchema>,
    options: EventListenerOptions = {},
  ) => {
    if (!this.#listeners[event.id]) {
      this.#listeners[event.id] = [];
    }
    const cloned: EventListener<TSchema> = (data: z.infer<TSchema>, options: EventOptions) => listener(data, options);
    this.#listeners[event.id].push(cloned);
    options.abortSignal?.addEventListener('abort', () => {
      this.#listeners[event.id] = this.#listeners[event.id].filter((l) => l !== cloned);
    });
  };

  public listenAll = (listener: WildcardListener): (() => void) => {
    this.#wildcardListeners.add(listener);
    return () => {
      this.#wildcardListeners.delete(listener);
    };
  };

  public publish = <TSchema extends ZodType = ZodType>(
    event: Event<TSchema>,
    data: z.infer<TSchema>,
    options: EventOptions,
  ) => {
    if (this.#listeners[event.id]) {
      this.#listeners[event.id].forEach((listener) => listener(data, options));
    }
    for (const wildcard of this.#wildcardListeners) {
      wildcard(event.id, data, options);
    }
  };
}

export type { WildcardListener, EventRegisteredCallback };
export { EventService };
