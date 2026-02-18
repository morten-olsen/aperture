import { createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

import { listDomainsOutputSchema } from '../schemas/schemas.js';

const listDomains = createTool({
  id: 'web-fetch.list-domains',
  description: 'List all domains on the web fetch allowlist.',
  input: z.object({}),
  output: listDomainsOutputSchema,
  invoke: async ({ services }) => {
    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    const domains = await service.listDomains();
    return { domains };
  },
});

export { listDomains };
