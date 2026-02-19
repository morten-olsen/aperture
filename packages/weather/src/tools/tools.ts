import type { Tool } from '@morten-olsen/agentic-core';

import { getWeather } from './tools.get-weather.js';

const weatherTools: Tool[] = [getWeather];

export { weatherTools };
