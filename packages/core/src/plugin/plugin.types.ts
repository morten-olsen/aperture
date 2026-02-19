import type { ZodType, ZodUnknown } from 'zod';

import type { Services } from '../utils/utils.service.js';
import type { Tool } from '../tool/tool.js';
import type { SecretsProvider } from '../secrets/secrets.js';

import type { PluginPrepare } from './plugin.prepare.js';

type PluginSetupInput = {
  services: Services;
  secrets: SecretsProvider;
};

type Plugin<TState extends ZodType = ZodUnknown> = {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly state: TState;
  readonly setup?: (input: PluginSetupInput) => Promise<void>;
  readonly prepare?: (input: PluginPrepare) => Promise<void>;
  readonly tools?: Tool[];
};

export type { PluginSetupInput, Plugin };
