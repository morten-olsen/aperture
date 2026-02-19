import { z } from 'zod';

const weatherInputSchema = z.object({
  latitude: z.number().describe('Latitude of the location'),
  longitude: z.number().describe('Longitude of the location'),
});

type WeatherInput = z.infer<typeof weatherInputSchema>;

const weatherResultSchema = z.object({
  temperature: z.number().describe('Current temperature in Celsius'),
  windSpeed: z.number().describe('Wind speed in km/h'),
  windDirection: z.number().describe('Wind direction in degrees'),
  weatherCode: z.number().describe('WMO weather code'),
  description: z.string().describe('Human-readable weather description'),
});

type WeatherResult = z.infer<typeof weatherResultSchema>;

export { weatherInputSchema, weatherResultSchema };
export type { WeatherInput, WeatherResult };
