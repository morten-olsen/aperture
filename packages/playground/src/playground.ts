import 'dotenv/config';
import { inspect } from 'node:util';

import { ConversationService } from '@morten-olsen/agentic-conversation';
import { triggerPlugin } from '@morten-olsen/agentic-trigger';

import { PluginService, Services } from '../../core/dist/exports.js';

const services = new Services();
const conversationService = services.get(ConversationService);
const pluginService = services.get(PluginService);

await pluginService.register(triggerPlugin);
const conversation = await conversationService.get('test');

const prompt1 = await conversation.prompt({
  input: 'Create a new random trigger',
  model: 'google/gemini-3-flash-preview',
});

await prompt1.run();

console.log(inspect(conversation.prompts, false, 1000, true));
