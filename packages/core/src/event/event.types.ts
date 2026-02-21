import type { z, ZodType } from 'zod';

type Event<TSchema extends ZodType = ZodType> = {
  id: string;
  schema: TSchema;
};

type EventOptions = {
  userId?: string;
};

type EventListener<TSchema extends ZodType = ZodType> = (data: z.infer<TSchema>, options: EventOptions) => void;

type EventListenerOptions = {
  abortSignal?: AbortSignal;
};

const createEvent = <TSchema extends ZodType = ZodType>(event: Event<TSchema>) => event;

export type { Event, EventOptions, EventListener, EventListenerOptions };
export { createEvent };
