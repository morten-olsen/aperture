import { EventEmitter } from '@morten-olsen/agentic-core';

import type { TriggerNotifyInput } from '../exports.js';

type NotificationServiceEvents = {
  published: (input: TriggerNotifyInput) => void;
};

class NotificationService extends EventEmitter<NotificationServiceEvents> {
  public publish = async (input: TriggerNotifyInput) => {
    this.emit('published', input);
  };
}

export { NotificationService };
