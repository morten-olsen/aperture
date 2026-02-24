import 'dotenv/config';

import { parseArgs } from 'node:util';

import { createClient } from './cli.client.js';
import { capabilities, invoke, prompt, tools, toolSchema } from './cli.commands.js';

const USAGE = `Usage: cli <command> [args]

Commands:
  tools                        List all tools
  tool-schema <toolId>         Get input/output schema for a tool
  invoke <toolId> [jsonInput]  Invoke a tool directly
  prompt <message> [-c id]     Send a prompt and stream events
  capabilities                 List registered plugins

Options:
  -c, --conversation <id>  Conversation ID (for prompt command)
  -m, --mode <mode>        Execution mode: classic or code (for prompt command)
  -h, --help               Show this help message

Environment:
  GLADOS_URL       Server base URL (required)
  GLADOS_USER_ID   X-User-Id header value (default: "cli")
`;

const main = async () => {
  const { values, positionals } = parseArgs({
    options: {
      conversation: { type: 'string', short: 'c' },
      mode: { type: 'string', short: 'm' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    process.stderr.write(USAGE);
    process.exit(positionals.length === 0 ? 1 : 0);
  }

  const command = positionals[0];
  const client = createClient();

  switch (command) {
    case 'tools':
      await tools(client);
      break;
    case 'tool-schema': {
      const toolId = positionals[1];
      if (!toolId) throw new Error('tool-schema requires a <toolId> argument');
      await toolSchema(client, toolId);
      break;
    }
    case 'invoke': {
      const toolId = positionals[1];
      if (!toolId) throw new Error('invoke requires a <toolId> argument');
      await invoke(client, toolId, positionals[2]);
      break;
    }
    case 'prompt': {
      const message = positionals[1];
      if (!message) throw new Error('prompt requires a <message> argument');
      await prompt(client, message, { conversationId: values.conversation, mode: values.mode });
      break;
    }
    case 'capabilities':
      await capabilities(client);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(JSON.stringify({ error: message }) + '\n');
  process.exit(1);
});
