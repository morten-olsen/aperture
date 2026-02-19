import { z } from 'zod';

const secretSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
});

type Secret = z.infer<typeof secretSchema>;

export type { Secret };
export { secretSchema };
