import type { Tool } from '@morten-olsen/agentic-core';

import { getBlueprint } from './tools.get.js';
import { createBlueprint } from './tools.create.js';
import { updateBlueprint } from './tools.update.js';
import { deleteBlueprint } from './tools.delete.js';
import { listBlueprints } from './tools.list.js';

const blueprintTools: Tool[] = [getBlueprint, createBlueprint, updateBlueprint, deleteBlueprint, listBlueprints];

export { blueprintTools };
