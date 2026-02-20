import { z } from 'zod';

const ruleTypeSchema = z.enum(['allow', 'deny']);

type RuleType = z.infer<typeof ruleTypeSchema>;

const shellPluginOptionsSchema = z.object({
  timeout: z.number().optional().describe('Default command timeout in milliseconds (default: 30000)'),
  maxOutputLength: z.number().optional().describe('Maximum characters returned per command (default: 50000)'),
  shell: z.string().optional().describe('Shell to use (default: /bin/sh)'),
  cwd: z.string().optional().describe('Default working directory'),
});

type ShellPluginOptions = z.infer<typeof shellPluginOptionsSchema>;

const executeInputSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  cwd: z.string().optional().describe('Override the default working directory for this command'),
  timeout: z.number().optional().describe('Override the default timeout in milliseconds for this command'),
});

type ExecuteInput = z.infer<typeof executeInputSchema>;

const executeOutputSchema = z.object({
  command: z.string(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  durationMs: z.number(),
});

type ExecuteOutput = z.infer<typeof executeOutputSchema>;

const ruleSchema = z.object({
  pattern: z.string(),
  type: ruleTypeSchema,
});

type Rule = z.infer<typeof ruleSchema>;

const addRuleInputSchema = z.object({
  pattern: z.string().describe('Glob-style pattern for commands (e.g. "git *", "npm run *")'),
  type: ruleTypeSchema.describe('Whether to allow or deny matching commands'),
});

type AddRuleInput = z.infer<typeof addRuleInputSchema>;

const addRuleOutputSchema = z.object({
  pattern: z.string(),
  type: ruleTypeSchema,
  added: z.boolean(),
});

const removeRuleInputSchema = z.object({
  pattern: z.string().describe('The pattern to remove from the rules'),
});

type RemoveRuleInput = z.infer<typeof removeRuleInputSchema>;

const removeRuleOutputSchema = z.object({
  pattern: z.string(),
  removed: z.boolean(),
});

const listRulesOutputSchema = z.object({
  rules: z.array(ruleSchema),
});

export {
  ruleTypeSchema,
  shellPluginOptionsSchema,
  executeInputSchema,
  executeOutputSchema,
  ruleSchema,
  addRuleInputSchema,
  addRuleOutputSchema,
  removeRuleInputSchema,
  removeRuleOutputSchema,
  listRulesOutputSchema,
};

export type { RuleType, ShellPluginOptions, ExecuteInput, ExecuteOutput, Rule, AddRuleInput, RemoveRuleInput };
