import type { Tool } from '@morten-olsen/agentic-core';

import { getUsage } from './tools.get-usage.js';

const usageTools: Tool[] = [getUsage];

export { usageTools };
