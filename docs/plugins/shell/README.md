# Shell Plugin

The shell plugin lets agents execute shell commands with safety controls. It registers as a **skill** that can be activated per conversation. A database-backed rule system controls which commands the agent may run, supporting both allow (whitelist) and deny (blacklist) patterns per user. Allowed commands execute freely, denied commands fail immediately, and unmatched commands pause for human approval.

## Registration

```typescript
import { createShellPlugin } from '@morten-olsen/agentic-shell';

// Default settings
await pluginService.register(createShellPlugin());

// Custom settings
await pluginService.register(
  createShellPlugin({
    timeout: 60_000,
    maxOutputLength: 100_000,
    shell: '/bin/bash',
    cwd: '/home/agent',
  }),
);
```

### Options

| Option           | Type     | Default      | Description                              |
|------------------|----------|--------------|------------------------------------------|
| `timeout`        | `number` | `30000`      | Default command timeout in milliseconds  |
| `maxOutputLength`| `number` | `50000`      | Max characters returned per command      |
| `shell`          | `string` | `'/bin/sh'`  | Shell to use for command execution       |
| `cwd`            | `string` | `process.cwd()` | Default working directory             |

## Available Tools

### `shell.execute`

Execute a shell command and return its output.

```typescript
// Input
{
  command: "git status",
  cwd: "/home/agent/project",  // optional
  timeout: 10000               // optional
}

// Output
{
  command: "git status",
  exitCode: 0,
  stdout: "On branch main\nnothing to commit",
  stderr: "",
  truncated: false,
  durationMs: 42
}
```

**Approval:** Dynamic — skipped if the command matches an allow rule, fails immediately if it matches a deny rule, pauses for human approval otherwise.

### `shell.add-rule`

Add a pattern to the shell command rules. Supports glob-style wildcards.

```typescript
// Input
{ pattern: "git *", type: "allow" }

// Output
{ pattern: "git *", type: "allow", added: true }  // false if already present
```

**Approval:** Always required.

### `shell.remove-rule`

Remove a pattern from the shell command rules.

```typescript
// Input
{ pattern: "git *" }

// Output
{ pattern: "git *", removed: true }  // false if not found
```

### `shell.list-rules`

List all shell command rules (both allow and deny).

```typescript
// Input: (none)

// Output
{
  rules: [
    { pattern: "git *", type: "allow" },
    { pattern: "rm *", type: "deny" }
  ]
}
```

## Pattern Matching

Patterns use glob-style wildcards where `*` matches any characters (including spaces):

- `ls` — matches only the exact command `ls`
- `git *` — matches `git status`, `git log --oneline`, etc.
- `npm run *` — matches `npm run build`, `npm run test`, etc.
- `docker * --name *` — matches `docker run --name myapp`, etc.

**Deny rules take precedence over allow rules.** If a command matches both a deny and an allow pattern, the deny rule wins and the command fails immediately without prompting for approval.

## User Segmentation

Rules are scoped per user. Each user has their own set of allow/deny rules. A rule added by one user does not affect another user's command execution permissions.

## Database

Database ID: `shell`

### `shell_rules`

| Column       | Type         | Notes                              |
|--------------|--------------|------------------------------------|
| `user_id`    | varchar(255) | PK (composite) — user identifier   |
| `pattern`    | varchar(255) | PK (composite) — glob pattern      |
| `type`       | varchar(255) | `'allow'` or `'deny'`              |
| `created_at` | varchar(255) | ISO 8601 timestamp                 |

## Server Configuration

Disabled by default. Configure via environment variables or config file:

| Environment Variable       | Default     | Description                              |
|---------------------------|-------------|------------------------------------------|
| `SHELL_ENABLED`           | `false`     | Enable/disable the plugin                |
| `SHELL_TIMEOUT`           | `30000`     | Default command timeout in milliseconds  |
| `SHELL_MAX_OUTPUT_LENGTH` | `50000`     | Max characters per command               |
| `SHELL_SHELL`             | `'/bin/sh'` | Shell to use                             |

## Dependencies

- `@morten-olsen/agentic-core` — plugin, tool, and services types
- `@morten-olsen/agentic-database` — database creation and DatabaseService
- `@morten-olsen/agentic-skill` — skill registration
- `zod` — schema validation
