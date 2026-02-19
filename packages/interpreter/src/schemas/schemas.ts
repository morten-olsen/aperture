import { z } from 'zod';

const runCodeInput = z.object({
  code: z.string().describe('The JavaScript code to execute'),
  input: z.unknown().optional().describe('An object which will be available to the script in the `input` variable'),
});

type RunCodeInput = z.infer<typeof runCodeInput>;

export type { RunCodeInput };
export { runCodeInput };
