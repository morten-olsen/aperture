import { z } from 'zod';

const ruleTypeSchema = z.enum(['allow', 'deny']);

type RuleType = z.infer<typeof ruleTypeSchema>;

const sshPluginOptionsSchema = z.object({
  timeout: z.number().optional().describe('Default command timeout in milliseconds (default: 30000)'),
  maxOutputLength: z.number().optional().describe('Maximum characters returned per command (default: 50000)'),
});

type SshPluginOptions = z.infer<typeof sshPluginOptionsSchema>;

const hostSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  port: z.number(),
  username: z.string(),
});

type Host = z.infer<typeof hostSchema>;

const ruleSchema = z.object({
  pattern: z.string(),
  host: z.string(),
  type: ruleTypeSchema,
});

type Rule = z.infer<typeof ruleSchema>;

const executeInputSchema = z.object({
  hostId: z.string().describe('Host ID to connect to'),
  command: z.string().describe('The command to execute on the remote host'),
  timeout: z.number().optional().describe('Override the default timeout in milliseconds'),
});

type ExecuteInput = z.infer<typeof executeInputSchema>;

const executeOutputSchema = z.object({
  hostId: z.string(),
  command: z.string(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  durationMs: z.number(),
});

type ExecuteOutput = z.infer<typeof executeOutputSchema>;

const addHostInputSchema = z.object({
  id: z.string().describe('User-defined host identifier (e.g. "prod-web-1")'),
  hostname: z.string().describe('Hostname or IP address'),
  port: z.number().optional().describe('SSH port (default: 22)'),
  username: z.string().describe('SSH username'),
});

type AddHostInput = z.infer<typeof addHostInputSchema>;

const addHostOutputSchema = z.object({
  id: z.string(),
  added: z.boolean(),
});

const removeHostInputSchema = z.object({
  id: z.string().describe('Host ID to remove'),
});

type RemoveHostInput = z.infer<typeof removeHostInputSchema>;

const removeHostOutputSchema = z.object({
  id: z.string(),
  removed: z.boolean(),
});

const listHostsOutputSchema = z.object({
  hosts: z.array(hostSchema),
});

const addRuleInputSchema = z.object({
  pattern: z.string().describe('Glob-style command pattern (e.g. "ls *", "cat *")'),
  host: z.string().describe('Glob-style host ID pattern (e.g. "prod-*", "*")'),
  type: ruleTypeSchema.describe('Whether to allow or deny matching commands on matching hosts'),
});

type AddRuleInput = z.infer<typeof addRuleInputSchema>;

const addRuleOutputSchema = z.object({
  pattern: z.string(),
  host: z.string(),
  type: ruleTypeSchema,
  added: z.boolean(),
});

const removeRuleInputSchema = z.object({
  pattern: z.string().describe('Command pattern of the rule to remove'),
  host: z.string().describe('Host pattern of the rule to remove'),
});

type RemoveRuleInput = z.infer<typeof removeRuleInputSchema>;

const removeRuleOutputSchema = z.object({
  pattern: z.string(),
  host: z.string(),
  removed: z.boolean(),
});

const listRulesOutputSchema = z.object({
  rules: z.array(ruleSchema),
});

const showPublicKeyOutputSchema = z.object({
  publicKey: z.string(),
});

export {
  ruleTypeSchema,
  sshPluginOptionsSchema,
  hostSchema,
  ruleSchema,
  executeInputSchema,
  executeOutputSchema,
  addHostInputSchema,
  addHostOutputSchema,
  removeHostInputSchema,
  removeHostOutputSchema,
  listHostsOutputSchema,
  addRuleInputSchema,
  addRuleOutputSchema,
  removeRuleInputSchema,
  removeRuleOutputSchema,
  listRulesOutputSchema,
  showPublicKeyOutputSchema,
};

export type {
  RuleType,
  SshPluginOptions,
  Host,
  Rule,
  ExecuteInput,
  ExecuteOutput,
  AddHostInput,
  RemoveHostInput,
  AddRuleInput,
  RemoveRuleInput,
};
