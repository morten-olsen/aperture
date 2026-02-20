import type { Tool } from '@morten-olsen/agentic-core';

import { addHost } from './tools.add-host.js';
import { addRule } from './tools.add-rule.js';
import { execute } from './tools.execute.js';
import { listHosts } from './tools.list-hosts.js';
import { listRules } from './tools.list-rules.js';
import { removeHost } from './tools.remove-host.js';
import { removeRule } from './tools.remove-rule.js';
import { showPublicKey } from './tools.show-public-key.js';

const sshTools: Tool[] = [execute, addHost, removeHost, listHosts, addRule, removeRule, listRules, showPublicKey];

export { sshTools };
