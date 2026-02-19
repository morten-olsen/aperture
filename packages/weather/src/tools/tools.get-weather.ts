import { createTool } from '@morten-olsen/agentic-core';

import { weatherInputSchema, weatherResultSchema } from '../schemas/schemas.js';

const getWeather = createTool({
  id: 'weather.get-weather',
  description: 'Get current weather conditions for a location given its coordinates',
  input: weatherInputSchema,
  output: weatherResultSchema,
  invoke: async ({ input, services }) => {
    const { WeatherService } = await import('../service/service.js');
    const service = services.get(WeatherService);
    return service.getWeather(input.latitude, input.longitude);
  },
});

export { getWeather };
