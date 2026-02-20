import { createTool, FileSystemService, type EntryMetadata } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const globInputSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g. "**/*.txt")'),
  cwd: z.string().optional().describe('Working directory for the glob (default: root)'),
});

const globOutputSchema = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      type: z.enum(['file', 'directory']),
      mimeType: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
});

const glob = createTool({
  id: 'filesystem.glob',
  description: 'Find files matching a glob pattern in the virtual file system.',
  input: globInputSchema,
  output: globOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const fs = services.get(FileSystemService);
    const entries: EntryMetadata[] = await fs.glob(userId, input.pattern, input.cwd);
    return { entries };
  },
});

export { glob };
