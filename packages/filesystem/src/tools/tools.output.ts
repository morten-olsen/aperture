import { createTool, FileSystemService } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const outputInputSchema = z.object({
  path: z.string().describe('Path of the file to send to the user'),
  description: z.string().optional().describe('Description of the file for the user'),
});

const outputOutputSchema = z.object({
  sent: z.boolean(),
  path: z.string(),
  mimeType: z.string().optional(),
});

const output = createTool({
  id: 'filesystem.output',
  description: 'Send a file from the virtual file system to the user.',
  input: outputInputSchema,
  output: outputOutputSchema,
  invoke: async ({ input, userId, services, addFileOutput }) => {
    const fs = services.get(FileSystemService);
    const metadata = await fs.stat(userId, input.path);
    if (!metadata || metadata.type !== 'file') {
      throw new Error(`File not found: ${input.path}`);
    }
    addFileOutput({
      path: input.path,
      mimeType: metadata.mimeType,
      description: input.description,
    });
    return { sent: true, path: input.path, mimeType: metadata.mimeType };
  },
});

export { output };
