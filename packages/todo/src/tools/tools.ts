import type { Tool } from '@morten-olsen/agentic-core';

import { addTag } from './tools.add-tag.js';
import { createTask } from './tools.create.js';
import { listTasks } from './tools.list.js';
import { removeTask } from './tools.remove.js';
import { removeTag } from './tools.remove-tag.js';
import { updateTask } from './tools.update.js';

const todoTools = [createTask, listTasks, updateTask, removeTask, addTag, removeTag];

const todoApiTools: Tool[] = [createTask, listTasks, updateTask, removeTask, addTag, removeTag];

export { todoTools, todoApiTools };
