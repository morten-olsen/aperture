import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { HomeAssistantService } from '../service/service.js';

const homeAssistantPluginOptionsSchema = z.object({
  url: z.string(),
  token: z.string(),
  locationTracking: z
    .array(
      z.object({
        entity: z.string(),
        userId: z.string(),
      }),
    )
    .optional(),
});

const homeAssistantPlugin = createPlugin({
  id: 'home-assistant',
  config: homeAssistantPluginOptionsSchema,
  state: z.unknown(),
  setup: async ({ config, services }) => {
    const haService = services.get(HomeAssistantService);
    await haService.connect({ url: config.url, token: config.token });

    if (config.locationTracking && config.locationTracking.length > 0) {
      const { LocationService } = await import('@morten-olsen/agentic-location');
      const locationService = services.get(LocationService);

      const entityMap: Record<string, string> = {};
      for (const { entity, userId } of config.locationTracking) {
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

export { homeAssistantPlugin, homeAssistantPluginOptionsSchema };
