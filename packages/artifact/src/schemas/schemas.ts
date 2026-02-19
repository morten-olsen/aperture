import { z } from 'zod';

const artifactSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string().optional(),
  data: z.unknown(),
  createdAt: z.string(),
});

type Artifact = z.infer<typeof artifactSchema>;

export { artifactSchema };
export type { Artifact };
