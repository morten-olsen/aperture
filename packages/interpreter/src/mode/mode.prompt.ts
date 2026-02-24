import type { Context, Tool } from '@morten-olsen/agentic-core';
import type { ZodType } from 'zod';

const toCamelCase = (id: string): string => id.replace(/[._-](\w)/g, (_, c: string) => c.toUpperCase());

type BuildSystemPromptOptions = {
  tools: Tool<ZodType, ZodType>[];
  context: Context;
};

const buildSystemPrompt = ({ tools, context }: BuildSystemPromptOptions): string => {
  const parts: string[] = [];

  parts.push(`You are an AI agent that communicates exclusively by writing JavaScript code.
Your code runs in a QuickJS sandbox. All tool functions are synchronous from your perspective — call them directly, do NOT use async/await.

## Rules
- Your ENTIRE response must be valid JavaScript code — no markdown fences, no prose.
- Do NOT use \`async\`, \`await\`, or Promises. All functions (including tools) behave synchronously.
- Use \`output(text)\` to send text to the user. You may call it multiple times.
- Call \`done()\` when you have finished responding. If you do not call done(), the system will feed your execution result back and ask you to continue.
- Use \`log(...args)\` for debug output visible only to you on the next iteration.
- Use \`store(key, value)\` and \`recall(key)\` to persist data across iterations within the same run.
- Use \`discoverTools()\` to get a list of available tool functions.
- Use \`toolSchema(toolId)\` to get the JSON Schema for a tool's input.
- Each tool is a function with a camelCase name. Pass a single object argument matching the tool's input schema. Call them directly: \`const result = myTool({ key: "value" })\`
- If a tool call fails, you will see the error on the next iteration. Adapt and retry or inform the user.
- Do NOT use import/export statements. All functions are globally available.`);

  if (tools.length > 0) {
    parts.push('\n## Available Tools\n');
    for (const tool of tools) {
      const fnName = toCamelCase(tool.id);
      parts.push(`- \`${fnName}(input)\` — ${tool.description} (tool ID: \`${tool.id}\`)`);
    }
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
