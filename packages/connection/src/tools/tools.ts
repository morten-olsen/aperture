import type { Tool } from '@morten-olsen/agentic-core';

import { secretsCreate } from './tools.secrets.create.js';
import { secretsList } from './tools.secrets.list.js';
import { secretsUpdate } from './tools.secrets.update.js';
import { secretsDelete } from './tools.secrets.delete.js';
import { connectionsTypes } from './tools.connections.types.js';
import { connectionsCreate } from './tools.connections.create.js';
import { connectionsList } from './tools.connections.list.js';
import { connectionsGet } from './tools.connections.get.js';
import { connectionsUpdate } from './tools.connections.update.js';
import { connectionsDelete } from './tools.connections.delete.js';

const secretTools: Tool[] = [secretsCreate, secretsList, secretsUpdate, secretsDelete];

const connectionTools: Tool[] = [
  connectionsTypes,
  connectionsCreate,
  connectionsList,
  connectionsGet,
  connectionsUpdate,
  connectionsDelete,
];

export { secretTools, connectionTools };
