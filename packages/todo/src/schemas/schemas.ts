import { z } from 'zod';

const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);

const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

const todoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  parentId: z.string().optional(),
  position: z.number(),
  project: z.string().optional(),
  agentNotes: z.string().optional(),
  startsAt: z.string().optional(),
  dueAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
});

type TodoTask = z.infer<typeof todoTaskSchema>;

const createTaskInputSchema = z.object({
  title: z.string().describe('Task title'),
  description: z.string().optional().describe('Task description'),
  status: taskStatusSchema.optional().describe('Task status (default: pending)'),
  priority: taskPrioritySchema.optional().describe('Task priority (default: medium)'),
  parentId: z.string().optional().describe('Parent task ID for subtasks'),
  position: z.number().optional().describe('Sort order (default: 0)'),
  project: z.string().optional().describe('Project name'),
  agentNotes: z.string().optional().describe('Private notes for the agent'),
  startsAt: z.string().optional().describe('Start date (ISO8601)'),
  dueAt: z.string().optional().describe('Due date (ISO8601)'),
  tags: z.array(z.string()).optional().describe('Tags to attach'),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

const updateTaskInputSchema = z.object({
  taskId: z.string().describe('ID of the task to update'),
  title: z.string().optional().describe('New title'),
  description: z.string().nullable().optional().describe('New description (null to clear)'),
  status: taskStatusSchema.optional().describe('New status'),
  priority: taskPrioritySchema.optional().describe('New priority'),
  parentId: z.string().nullable().optional().describe('New parent ID (null to make top-level)'),
  position: z.number().optional().describe('New sort order'),
  project: z.string().nullable().optional().describe('New project (null to clear)'),
  agentNotes: z.string().nullable().optional().describe('New agent notes (null to clear)'),
  startsAt: z.string().nullable().optional().describe('New start date (null to clear)'),
  dueAt: z.string().nullable().optional().describe('New due date (null to clear)'),
});

type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

const listTasksInputSchema = z.object({
  status: taskStatusSchema.optional().describe('Filter by status'),
  priority: taskPrioritySchema.optional().describe('Filter by priority'),
  project: z.string().optional().describe('Filter by project'),
  parentId: z.string().nullable().optional().describe('Filter by parent ID (null for top-level only)'),
  tags: z.array(z.string()).optional().describe('Filter by tags (all must match)'),
  search: z.string().optional().describe('Search in title and description'),
  limit: z.number().optional().describe('Max results (default: 50)'),
});

type ListTasksInput = z.infer<typeof listTasksInputSchema>;

const removeTaskInputSchema = z.object({
  taskId: z.string().describe('ID of the task to remove'),
});

type RemoveTaskInput = z.infer<typeof removeTaskInputSchema>;

const tagInputSchema = z.object({
  taskId: z.string().describe('Task ID'),
  tag: z.string().describe('Tag name'),
});

type TagInput = z.infer<typeof tagInputSchema>;

export {
  taskStatusSchema,
  taskPrioritySchema,
  todoTaskSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
  listTasksInputSchema,
  removeTaskInputSchema,
  tagInputSchema,
};
export type { TodoTask, CreateTaskInput, UpdateTaskInput, ListTasksInput, RemoveTaskInput, TagInput };
