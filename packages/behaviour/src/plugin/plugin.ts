import { createPlugin } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const behaviourPlugin = createPlugin({
  id: 'behaviour',
  state: z.object({}),
});
