import { createTool } from '@morten-olsen/agentic-core';

import { addDomainInputSchema, addDomainOutputSchema } from '../schemas/schemas.js';

const addDomain = createTool({
  id: 'web-fetch.add-domain',
  description: 'Add a domain to the web fetch allowlist.',
  input: addDomainInputSchema,
  output: addDomainOutputSchema,
  invoke: async ({ input, services }) => {
    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    const added = await service.addDomain(input.domain);
    return { domain: input.domain.toLowerCase(), added };
  },
});

export { addDomain };
