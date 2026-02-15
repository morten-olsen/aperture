import type OpenAI from 'openai';

import type { Context } from '../context/context.schema.js';

import type { Prompt } from './prompt.schema.js';

const promptsToMessages = (prompts: Prompt[]) => {
  const messages: OpenAI.Responses.ResponseInput = [];

  for (const prompt of prompts) {
    if (prompt.input) {
      messages.push({
        role: 'user',
        content: prompt.input,
      });
    }
    for (const output of prompt.output) {
      if (output.type === 'text' && output.content) {
        messages.push({
          role: 'assistant',
          content: output.content,
        });
      }
      if (output.type === 'tool') {
        messages.push({
          type: 'function_call',
          call_id: output.id,
          name: output.function,
          arguments: JSON.stringify(output.input ?? {}),
        });
        messages.push({
          type: 'function_call_output',
          call_id: output.id,
          output:
            output.result.type === 'success'
              ? JSON.stringify(output.result.output)
              : JSON.stringify(output.result.error),
        });
      }
    }
  }

  return messages;
};

const contextToMessages = (context: Context): OpenAI.Responses.ResponseInput => {
  return [
    {
      role: 'system',
      content: context.items.map((item) => item.content).join('\n\n'),
    },
  ];
};

export { promptsToMessages, contextToMessages };
