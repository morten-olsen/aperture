import { z } from 'zod';

const triggerNotifyInputSchema = z.object({
  userId: z.string(),
  title: z.string().describe('Short notification title (max 100 chars)'),
  body: z.string().describe('Notification content (max 1000 chars)'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Notification urgency level'),
});

type TriggerNotifyInput = z.infer<typeof triggerNotifyInputSchema>;

export type { TriggerNotifyInput };
export { triggerNotifyInputSchema };
