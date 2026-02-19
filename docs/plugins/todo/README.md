# Todo Plugin

The todo plugin provides full-featured task management with hierarchical tasks (subtasks), priorities, projects, tags, due dates, and agent notes. Overdue and urgent tasks are automatically surfaced in prompt context as alerts.

## Registration

```typescript
import { todoPlugin } from '@morten-olsen/agentic-todo';

await pluginService.register(todoPlugin);
```

No configuration options. Plugin ID: `'todo'`.

## Available Tools

### `todo.create`

Create a new task. Supports subtasks via `parentId`.

```typescript
{
  title: "Review PR #42",
  description: "Check for security issues",     // optional
  status: "pending",                             // optional: pending, in_progress, completed, cancelled
  priority: "high",                              // optional: low, medium, high, urgent
  parentId: "parent-task-id",                    // optional — makes this a subtask
  position: 0,                                   // optional — ordering within siblings
  project: "backend",                            // optional
  agentNotes: "Blocked until CI passes",         // optional — private notes
  startsAt: "2026-02-20T09:00:00Z",             // optional
  dueAt: "2026-02-21T17:00:00Z",                // optional
  tags: ["review", "security"]                   // optional
}
```

### `todo.list`

List tasks with optional filters.

```typescript
{
  status: "pending",          // optional
  priority: "urgent",         // optional
  project: "backend",         // optional
  parentId: null,             // optional — null for top-level only
  tags: ["review"],           // optional — tasks matching all tags
  search: "PR",              // optional — text search in title/description
  limit: 20                   // optional
}

// Output
{
  tasks: [{ id, title, status, priority, ... }],
  total: 5
}
```

### `todo.update`

Update a task. Only provided fields are changed. Setting status to `'completed'` automatically sets `completedAt`.

```typescript
{
  id: "task-123",
  status: "completed",
  agentNotes: "Reviewed, no issues found"
}
```

### `todo.remove`

Remove a task. Recursively deletes all child tasks.

```typescript
{ id: "task-123" }
```

### `todo.add-tag`

Add a tag to a task.

```typescript
{ taskId: "task-123", tag: "urgent" }
```

### `todo.remove-tag`

Remove a tag from a task.

```typescript
{ taskId: "task-123", tag: "urgent" }
```

## Context Injection

On each prompt, the plugin checks for overdue and urgent tasks for the current user. If found, it injects an alert:

```
Task alerts: 2 overdue task(s). 1 urgent task(s): Deploy hotfix.
```

## Database

Database ID: `todo`

### `todo_tasks`

| Column         | Type         | Notes                                   |
|----------------|--------------|-----------------------------------------|
| `id`           | varchar(255) | PK — UUID                               |
| `user_id`      | varchar(255) | Owner                                   |
| `title`        | varchar(500) | Task title                              |
| `description`  | text         | Optional detailed description           |
| `status`       | varchar(50)  | `pending`, `in_progress`, `completed`, `cancelled` |
| `priority`     | varchar(50)  | `low`, `medium`, `high`, `urgent`       |
| `parent_id`    | varchar(255) | FK to parent task (subtasks)            |
| `position`     | integer      | Ordering within siblings (default: 0)   |
| `project`      | varchar(255) | Optional project grouping               |
| `agent_notes`  | text         | Private notes for the agent             |
| `starts_at`    | text         | ISO 8601 — when to start                |
| `due_at`       | text         | ISO 8601 — deadline                     |
| `completed_at` | text         | ISO 8601 — auto-set on completion       |
| `created_at`   | text         | ISO 8601 timestamp                      |
| `updated_at`   | text         | ISO 8601 timestamp                      |

### `todo_tags`

| Column    | Type         | Notes               |
|-----------|--------------|----------------------|
| `id`      | varchar(255) | PK — UUID            |
| `task_id` | varchar(255) | FK to todo_tasks     |
| `tag`     | varchar(255) | Tag label            |

## Dependencies

- `@morten-olsen/agentic-core` — plugin and tool definitions
- `@morten-olsen/agentic-database` — database creation and DatabaseService
