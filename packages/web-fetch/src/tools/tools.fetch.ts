import { createTool } from '@morten-olsen/agentic-core';

import { fetchInputSchema, fetchResultSchema } from '../schemas/schemas.js';

const fetchUrl = createTool({
  id: 'web-fetch.fetch',
  description: 'Fetch a URL and return its content as HTML, Markdown, or a list of links.',
  input: fetchInputSchema,
  output: fetchResultSchema,
  requireApproval: async ({ input, services }) => {
    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    const domain = new URL(input.url).hostname.toLowerCase();
    const allowed = await service.isAllowed(domain);
    return { required: !allowed, reason: `Domain "${domain}" is not on the allowlist.` };
  },
  invoke: async ({ input, services }) => {
    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    return service.fetch({ ...input, force: true });
  },
});

export { fetchUrl };
