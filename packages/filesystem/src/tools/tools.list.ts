import { createTool, FileSystemService, type EntryMetadata } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const listInputSchema = z.object({
  path: z.string().default('').describe('Directory path to list (default: root)'),
});

const listOutputSchema = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      type: z.enum(['file', 'directory']),
      mimeType: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
});

const list = createTool({
  id: 'filesystem.list',
  description: 'List files and directories at a given path in the virtual file system.',
  input: listInputSchema,
  output: listOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const fs = services.get(FileSystemService);
    const entries: EntryMetadata[] = await fs.list(userId, input.path ?? '');
    return { entries };
  },
});

export { list };
