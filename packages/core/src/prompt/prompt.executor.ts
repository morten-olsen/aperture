import type { Services } from '../utils/utils.service.js';
import type { State } from '../state/state.js';

import type { Prompt, PromptUsage } from './prompt.schema.js';

type ExecutorCreateOptions = {
  services: Services;
  userId: string;
  model?: 'normal' | 'high';
  mode?: string;
  history?: Prompt[];
  input?: string;
  state?: Record<string, unknown>;
  maxRounds?: number;
  resumePrompt?: Prompt;
};

type PromptExecutor = {
  readonly prompt: Prompt;
  readonly id: string;
  readonly userId: string;
  readonly state: State;
  readonly usage: PromptUsage;
  run(): Promise<Prompt>;
  approve(toolCallId: string): Promise<void>;
  reject(toolCallId: string, reason?: string): Promise<void>;
};

type ExecutionModeFactory = {
  id: string;
  name: string;
  createExecutor(options: ExecutorCreateOptions): PromptExecutor;
};

export type { ExecutorCreateOptions, PromptExecutor, ExecutionModeFactory };
