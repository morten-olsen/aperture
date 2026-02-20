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
      if (output.type === 'file') {
        const desc = output.description ? ` — ${output.description}` : '';
        messages.push({
          role: 'assistant',
          content: `[File sent to user: "${output.path}"${desc}]`,
        });
      }
      if (output.type === 'tool') {
        messages.push({
          type: 'function_call',
          call_id: output.id,
          name: output.function,
          arguments: JSON.stringify(output.input ?? {}),
        });

        let resultOutput: string;
        if (output.result.type === 'success') {
          resultOutput = JSON.stringify(output.result.output);
        } else if (output.result.type === 'pending') {
          resultOutput = JSON.stringify({ pending: true, reason: output.result.reason });
        } else {
          resultOutput = JSON.stringify(output.result.error);
        }

        messages.push({
          type: 'function_call_output',
          call_id: output.id,
          output: resultOutput,
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
