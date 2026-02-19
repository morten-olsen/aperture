import type { Tool } from '@morten-olsen/agentic-core';

import { get } from './tools.get.js';
import { list } from './tools.list.js';
import { set } from './tools.set.js';

const dailyNoteTools: Tool[] = [get, set, list];

export { dailyNoteTools };
