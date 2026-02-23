import { z } from 'zod';

const secretSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Secret = z.infer<typeof secretSchema>;

export type { Secret };
export { secretSchema };
