import { fetchWeatherApi } from 'openmeteo';

import type { WeatherResult } from '../schemas/schemas.js';

const weatherCodeDescriptions: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const describeWeatherCode = (code: number): string => {
  return weatherCodeDescriptions[code] ?? `Unknown (code ${code})`;
};

class WeatherService {
  getWeather = async (latitude: number, longitude: number): Promise<WeatherResult> => {
    const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', {
      latitude: [latitude],
      longitude: [longitude],
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
    });

    const response = responses[0];
    const current = response.current();
    if (!current) {
      throw new Error('No current weather data available');
    }

    const temperatureVar = current.variables(0);
    const weatherCodeVar = current.variables(1);
    const windSpeedVar = current.variables(2);
    const windDirectionVar = current.variables(3);

    if (!temperatureVar || !weatherCodeVar || !windSpeedVar || !windDirectionVar) {
      throw new Error('Missing weather variables in response');
    }

    const temperature = temperatureVar.value();
    const weatherCode = weatherCodeVar.value();
    const windSpeed = windSpeedVar.value();
    const windDirection = windDirectionVar.value();

    return {
      temperature,
      windSpeed,
      windDirection,
      weatherCode,
      description: describeWeatherCode(weatherCode),
    };
  };
}

export { WeatherService };
