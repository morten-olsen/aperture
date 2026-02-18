import { createTool } from '@morten-olsen/agentic-core';

import { removeDomainInputSchema, removeDomainOutputSchema } from '../schemas/schemas.js';

const removeDomain = createTool({
  id: 'web-fetch.remove-domain',
  description: 'Remove a domain from the web fetch allowlist.',
  input: removeDomainInputSchema,
  output: removeDomainOutputSchema,
  invoke: async ({ input, services }) => {
    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    const removed = await service.removeDomain(input.domain);
    return { domain: input.domain.toLowerCase(), removed };
  },
});

export { removeDomain };
