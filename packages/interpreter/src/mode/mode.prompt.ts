import type { Context, Tool } from '@morten-olsen/agentic-core';
import type { ZodType } from 'zod';

const toCamelCase = (id: string): string => id.replace(/[._-](\w)/g, (_, c: string) => c.toUpperCase());

type BuildSystemPromptOptions = {
  tools: Tool<ZodType, ZodType>[];
  context: Context;
  moduleNames?: string[];
};

const buildSystemPrompt = ({ tools, context, moduleNames }: BuildSystemPromptOptions): string => {
  const parts: string[] = [];

  const hasModules = moduleNames && moduleNames.length > 0;

  parts.push(`You are an AI agent that communicates exclusively by writing JavaScript code.
Your code runs in a QuickJS sandbox with a 30-second execution timeout.

## Rules
- Your ENTIRE response must be valid JavaScript code — no markdown fences, no prose.
- All functions are transparently async — they appear synchronous but handle async operations automatically. Do NOT use \`await\` or \`async\` keywords.
- Use \`output(text)\` to send text to the user. You may call it multiple times.
- Call \`done()\` when you have finished responding. If you do not call done(), the system will feed your execution result back and ask you to continue.
- Or use \`complete({ response, data?, followUp? })\` as a structured alternative — it outputs the response, optionally stores data, and calls done() for you.
- Use \`log(...args)\` for debug output visible only to you on the next iteration.
- Use \`store(key, value)\` and \`recall(key)\` to persist data across iterations within the same run.
- Use \`parallel([{tool, input}, ...])\` to execute multiple tool calls concurrently. The \`tool\` field must be the tool ID (e.g. \`"weather.get-weather"\`), not the camelCase function name. Returns an array of results (individual failures return \`{error}\` instead of aborting).
- Use \`llm(prompt)\` for simple text completion sub-calls. Use \`llmJson(prompt)\` for structured JSON responses.
- Use \`toolSchema(toolId)\` to get the JSON Schema for a tool's input before calling it for the first time.
- Each tool is a function with a camelCase name. Pass a single object argument matching the tool's input schema: \`const result = myTool({ key: "value" })\`
- If a tool call fails, you will see the error with line number and context on the next iteration. Adapt and retry or inform the user.${hasModules ? `\n- You may use \`import\` statements to load available modules. When using imports, your entire response must be a valid ES module.` : `\n- Do NOT use import/export statements. All functions are globally available.`}`);

  if (tools.length > 0) {
    parts.push('\n## Available Tools\n');
    const grouped = new Map<string, { fnName: string; toolId: string; description: string }[]>();
    for (const tool of tools) {
      const dotIdx = tool.id.indexOf('.');
      const namespace = dotIdx > 0 ? tool.id.slice(0, dotIdx) : '_';
      const fnName = toCamelCase(tool.id);
      const existing = grouped.get(namespace);
      if (existing) {
        existing.push({ fnName, toolId: tool.id, description: tool.description });
      } else {
        grouped.set(namespace, [{ fnName, toolId: tool.id, description: tool.description }]);
      }
    }
    for (const [namespace, entries] of grouped) {
      const toolList = entries.map((e) => `${e.fnName} (ID: ${e.toolId}) — ${e.description}`).join(' | ');
      parts.push(`**${namespace}**: ${toolList}`);
    }
  }

  if (hasModules) {
    parts.push(`\n## Available Modules\n`);
    parts.push(moduleNames.map((m) => `\`${m}\``).join(', '));
  }

  if (context.items.length > 0) {
    parts.push('\n## Context\n');
    for (const item of context.items) {
      const label = item.id ? `[${item.type}:${item.id}]` : `[${item.type}]`;
      parts.push(`${label}\n${item.content}`);
    }
  }

  return parts.join('\n');
};

export { buildSystemPrompt, toCamelCase };
