import { createTool, FileSystemService } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const writeInputSchema = z.object({
  path: z.string().describe('The file path to write to'),
  content: z.string().describe('The file content'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8').describe('Content encoding (default: utf-8)'),
  mimeType: z.string().optional().describe('MIME type of the file'),
});

const writeOutputSchema = z.object({
  written: z.boolean(),
  path: z.string(),
});

const write = createTool({
  id: 'filesystem.write',
  description: 'Write content to a file in the virtual file system. Parent directories are created automatically.',
  input: writeInputSchema,
  output: writeOutputSchema,
  invoke: async ({ input, userId, services }) => {
    const fs = services.get(FileSystemService);
    const encoding = input.encoding ?? 'utf-8';
    const data = encoding === 'base64' ? Buffer.from(input.content, 'base64') : Buffer.from(input.content, 'utf-8');
    await fs.write(userId, input.path, data, input.mimeType);
    return { written: true, path: input.path };
  },
});

export { write };
