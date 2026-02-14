import { z } from 'zod';

const behaviourSchema = z.object({
  id: z.string(),
  title: z.string(),
  behaviour: z.string(),
  notes: z.string(),
  updated: z.iso.date(),
});

type Behaviour = z.input<typeof behaviourSchema>;

export type { Behaviour };
export { behaviourSchema };
