import type { z, ZodType, ZodUnknown } from 'zod';

import type { Services } from '../utils/utils.service.js';
import type { Tool } from '../tool/tool.js';
import type { SecretsProvider } from '../secrets/secrets.js';

import type { PluginPrepare } from './plugin.prepare.js';

type PluginSetupInput<TConfig extends ZodType = ZodUnknown> = {
  services: Services;
  secrets: SecretsProvider;
  config: z.infer<TConfig>;
};

type Plugin<TState extends ZodType = ZodUnknown, TConfig extends ZodType = ZodUnknown> = {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly state: TState;
  readonly config: TConfig;
  readonly setup?: (input: PluginSetupInput<TConfig>) => Promise<void>;
  readonly prepare?: (input: PluginPrepare<TConfig>) => Promise<void>;
  readonly tools?: Tool[];
};

export type { PluginSetupInput, Plugin };
