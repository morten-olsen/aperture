import { EventService, createEvent } from '@morten-olsen/agentic-core';
import type { Services } from '@morten-olsen/agentic-core';

import { triggerNotifyInputSchema, type TriggerNotifyInput } from '../schemas/schemas.js';

const notificationPublishedEvent = createEvent({
  id: 'notification.published',
  schema: triggerNotifyInputSchema,
});

class NotificationService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
    const eventService = services.get(EventService);
    eventService.registerEvent(notificationPublishedEvent);
  }

  public publish = async (input: TriggerNotifyInput) => {
    const eventService = this.#services.get(EventService);
    eventService.publish(notificationPublishedEvent, input, { userId: input.userId });
  };
}

export { NotificationService, notificationPublishedEvent };
