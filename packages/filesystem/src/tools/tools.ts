import type { Tool } from '@morten-olsen/agentic-core';

import { glob } from './tools.glob.js';
import { list } from './tools.list.js';
import { output } from './tools.output.js';
import { read } from './tools.read.js';
import { remove } from './tools.remove.js';
import { write } from './tools.write.js';

const filesystemTools: Tool[] = [write, read, list, glob, remove, output];

export { filesystemTools };
