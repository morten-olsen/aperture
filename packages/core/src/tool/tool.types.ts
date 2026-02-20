import type { z, ZodType } from 'zod';

import type { State } from '../state/state.js';
import type { Services } from '../exports.js';
import type { SecretsProvider } from '../secrets/secrets.types.js';

type FileOutputDescriptor = {
  path: string;
  mimeType?: string;
  description?: string;
};

type ToolInput<TInput extends ZodType> = {
  userId: string;
  input: z.input<TInput>;
  state: State;
  services: Services;
  secrets: SecretsProvider;
  addFileOutput: (file: FileOutputDescriptor) => void;
};

type ApprovalRequest = {
  required: boolean;
  reason: string;
};

type RequireApproval<TInput extends ZodType> = (input: ToolInput<TInput>) => ApprovalRequest | Promise<ApprovalRequest>;

type Tool<TInput extends ZodType = ZodType, TOutput extends ZodType = ZodType> = {
  id: string;
  description: string;
  input: TInput;
  output: TOutput;
  requireApproval?: ApprovalRequest | RequireApproval<TInput>;
  invoke: (input: ToolInput<TInput>) => Promise<z.output<TOutput>>;
};

export type { Tool, ToolInput, FileOutputDescriptor, ApprovalRequest, RequireApproval };
