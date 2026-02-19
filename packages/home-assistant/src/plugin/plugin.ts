import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { HomeAssistantService } from '../service/service.js';

type CreateHomeAssistantPluginOptions = {
  url: string;
  token: string;
  locationTracking?: { entity: string; userId: string }[];
};

const createHomeAssistantPlugin = ({ url, token, locationTracking }: CreateHomeAssistantPluginOptions) =>
  createPlugin({
    id: 'home-assistant',
    state: z.unknown(),
    setup: async ({ services }) => {
      const haService = services.get(HomeAssistantService);
      await haService.connect({ url, token });

      if (locationTracking && locationTracking.length > 0) {
        const { LocationService } = await import('@morten-olsen/agentic-location');
        const locationService = services.get(LocationService);

        const entityMap: Record<string, string> = {};
        for (const { entity, userId } of locationTracking) {
          entityMap[entity] = userId;
        }

        haService.subscribeEntities((entities) => {
          for (const [entityId, userId] of Object.entries(entityMap)) {
            const entity = entities[entityId];
            if (!entity) continue;

            const lat = entity.attributes.latitude;
            const lng = entity.attributes.longitude;
            if (typeof lat !== 'number' || typeof lng !== 'number') continue;

            locationService.updateLocation(userId, lat, lng).catch((err) => {
              console.error(`[home-assistant] Failed to update location for ${userId}:`, err);
            });
          }
        });
      }
    },
  });

export { createHomeAssistantPlugin };
export type { CreateHomeAssistantPluginOptions };
