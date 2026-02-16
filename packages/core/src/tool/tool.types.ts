import type { z, ZodType } from 'zod';

import type { State } from '../state/state.js';
import type { Services } from '../exports.js';

type ToolInput<TInput extends ZodType> = {
  userId: string;
  input: z.input<TInput>;
  state: State;
  services: Services;
};

type Tool<TInput extends ZodType = ZodType, TOutput extends ZodType = ZodType> = {
  id: string;
  description: string;
  input: TInput;
  output: TOutput;
  invoke: (input: ToolInput<TInput>) => Promise<z.output<TOutput>>;
};

export type { Tool, ToolInput };
