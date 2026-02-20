import { z } from 'zod';

const entryMetadataSchema = z.object({
  path: z.string(),
  type: z.enum(['file', 'directory']),
  mimeType: z.string().optional(),
  size: z.number().optional(),
});

export { entryMetadataSchema };
