import { createTool } from '@morten-olsen/agentic-core';

import { fetchInputSchema, fetchResultSchema } from '../schemas/schemas.js';

const fetchUrl = createTool({
  id: 'web-fetch.fetch',
  description: 'Fetch a URL and return its content as HTML, Markdown, or a list of links.',
  input: fetchInputSchema,
  output: fetchResultSchema,
  invoke: async ({ input, services }) => {
    const { WebFetchService } = await import('../service/service.js');
    const service = services.get(WebFetchService);
    return service.fetch(input);
  },
});

export { fetchUrl };
