import type { Tool } from '@morten-olsen/agentic-core';

import { connectionsCreate } from './tools.connections.create.js';
import { connectionsDelete } from './tools.connections.delete.js';
import { connectionsDiagnose } from './tools.connections.diagnose.js';
import { connectionsGet } from './tools.connections.get.js';
import { connectionsList } from './tools.connections.list.js';
import { connectionsTypes } from './tools.connections.types.js';
import { connectionsUpdate } from './tools.connections.update.js';
import { secretsCreate } from './tools.secrets.create.js';
import { secretsDelete } from './tools.secrets.delete.js';
import { secretsList } from './tools.secrets.list.js';
import { secretsUpdate } from './tools.secrets.update.js';
import { secretsVerify } from './tools.secrets.verify.js';

const secretTools: Tool[] = [secretsCreate, secretsList, secretsUpdate, secretsDelete, secretsVerify];

const connectionTools: Tool[] = [
  connectionsTypes,
  connectionsCreate,
  connectionsList,
  connectionsGet,
  connectionsUpdate,
  connectionsDelete,
  connectionsDiagnose,
];

export { secretTools, connectionTools };
