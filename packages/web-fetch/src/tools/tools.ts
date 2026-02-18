import type { Tool } from '@morten-olsen/agentic-core';

import { addDomain } from './tools.add-domain.js';
import { fetchUrl } from './tools.fetch.js';
import { listDomains } from './tools.list-domains.js';
import { removeDomain } from './tools.remove-domain.js';

const webFetchTools: Tool[] = [fetchUrl, addDomain, removeDomain, listDomains];

export { webFetchTools };
