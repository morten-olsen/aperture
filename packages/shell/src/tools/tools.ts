import type { Tool } from '@morten-olsen/agentic-core';

import { addRule } from './tools.add-rule.js';
import { execute } from './tools.execute.js';
import { listRules } from './tools.list-rules.js';
import { removeRule } from './tools.remove-rule.js';

const shellTools: Tool[] = [execute, addRule, removeRule, listRules];

export { shellTools };
