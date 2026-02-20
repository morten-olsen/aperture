import { createTool, FileSystemService } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const removeInputSchema = z.object({
  path: z.string().describe('The file or directory path to remove'),
});

const removeOutputSchema = z.object({
  removed: z.boolean(),
  path: z.string(),
});

const remove = createTool({
  id: 'filesystem.remove',
  description: 'Remove a file or directory from the virtual file system.',
  input: removeInputSchema,
  output: removeOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const fs = services.get(FileSystemService);
    await fs.remove(userId, input.path);
    return { removed: true, path: input.path };
  },
});

export { remove };
