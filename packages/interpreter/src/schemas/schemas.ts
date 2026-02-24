import { z } from 'zod';

const runCodeInput = z.object({
  code: z.string().describe('The JavaScript code to execute'),
  input: z.unknown().optional().describe('An object which will be available to the script in the `input` variable'),
  timeout: z.number().optional().describe('Execution timeout in milliseconds (default: 30000). Prevents runaway code.'),
});

type RunCodeInput = z.infer<typeof runCodeInput>;

export type { RunCodeInput };
export { runCodeInput };
