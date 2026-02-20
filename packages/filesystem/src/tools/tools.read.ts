import { createTool, FileSystemService } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const readInputSchema = z.object({
  path: z.string().describe('The file path to read'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8').describe('Output encoding (default: utf-8)'),
});

const readOutputSchema = z.object({
  content: z.string().nullable(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
});

const read = createTool({
  id: 'filesystem.read',
  description: 'Read a file from the virtual file system.',
  input: readInputSchema,
  output: readOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const fs = services.get(FileSystemService);
    const result = await fs.read(userId, input.path);
    if (!result) {
      return { content: null };
    }
    const encoding = input.encoding ?? 'utf-8';
    const content = encoding === 'base64' ? result.data.toString('base64') : result.data.toString('utf-8');
    return {
      content,
      mimeType: result.metadata.mimeType,
      size: result.metadata.size,
    };
  },
});

export { read };
