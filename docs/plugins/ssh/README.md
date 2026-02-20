# SSH Plugin

The SSH plugin lets agents execute commands on remote hosts via SSH. It registers as a **skill** that can be activated per conversation. It provides per-user host management, allow/deny command rules with glob-style wildcards for both command patterns and host ID patterns, and automatic ed25519 key pair generation stored in the database.

## Registration

```typescript
import { createSshPlugin } from '@morten-olsen/agentic-ssh';

// Default settings
await pluginService.register(createSshPlugin());

// Custom settings
await pluginService.register(
  createSshPlugin({
    timeout: 60_000,
    maxOutputLength: 100_000,
  }),
);
```

### Options

| Option           | Type     | Default | Description                             |
|------------------|----------|---------|-----------------------------------------|
| `timeout`        | `number` | `30000` | Default command timeout in milliseconds |
| `maxOutputLength`| `number` | `50000` | Max characters returned per command     |

## Typical Workflow

1. Agent calls `ssh.show-public-key` to get the user's public key (generates a new ed25519 key pair on first call)
2. User adds the public key to `~/.ssh/authorized_keys` on target servers
3. Agent calls `ssh.add-host` to register host configurations
4. Agent calls `ssh.add-rule` to set up allow/deny rules
5. Agent calls `ssh.execute` to run commands on remote hosts

## Available Tools

### `ssh.execute`

Execute a command on a remote host via SSH.

```typescript
// Input
{
  hostId: "prod-web-1",
  command: "uptime",
  timeout: 10000     // optional
}

// Output
{
  hostId: "prod-web-1",
  command: "uptime",
  exitCode: 0,
  stdout: " 14:30:00 up 42 days",
  stderr: "",
  truncated: false,
  durationMs: 150
}
```

**Approval:** Dynamic — skipped if command + host matches an allow rule, fails immediately if it matches a deny rule, pauses for human approval otherwise.

### `ssh.add-host`

Add an SSH host configuration.

```typescript
// Input
{
  id: "prod-web-1",
  hostname: "10.0.1.5",
  port: 22,            // optional, default: 22
  username: "deploy"
}

// Output
{ id: "prod-web-1", added: true }  // false if ID already exists
```

**Approval:** Always required.

### `ssh.remove-host`

Remove an SSH host configuration.

```typescript
// Input
{ id: "prod-web-1" }

// Output
{ id: "prod-web-1", removed: true }  // false if not found
```

### `ssh.list-hosts`

List all configured SSH hosts.

```typescript
// Input: (none)

// Output
{
  hosts: [
    { id: "prod-web-1", hostname: "10.0.1.5", port: 22, username: "deploy" },
    { id: "staging-1", hostname: "10.0.2.1", port: 2222, username: "admin" }
  ]
}
```

### `ssh.add-rule`

Add a rule for SSH command execution. Supports glob-style wildcards for both command patterns and host ID patterns.

```typescript
// Input
{ pattern: "ls *", host: "prod-*", type: "allow" }

// Output
{ pattern: "ls *", host: "prod-*", type: "allow", added: true }
```

**Approval:** Always required.

### `ssh.remove-rule`

Remove a rule from the SSH command rules.

```typescript
// Input
{ pattern: "ls *", host: "prod-*" }

// Output
{ pattern: "ls *", host: "prod-*", removed: true }
```

### `ssh.list-rules`

List all SSH command rules (both allow and deny).

```typescript
// Input: (none)

// Output
{
  rules: [
    { pattern: "ls *", host: "*", type: "allow" },
    { pattern: "rm *", host: "prod-*", type: "deny" }
  ]
}
```

### `ssh.show-public-key`

Show the SSH public key for the current user. Generates a new ed25519 key pair on first call.

```typescript
// Input: (none)

// Output
{ publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA..." }
```

## Pattern Matching

Rules match on both a command pattern and a host ID pattern, using glob-style wildcards where `*` matches any characters:

- **Command patterns:** `ls` (exact), `git *` (prefix), `cat /var/log/*` (path prefix)
- **Host patterns:** `*` (all hosts), `prod-*` (prod hosts), `staging-1` (exact host)

A rule matches only when **both** the command and host patterns match. Deny rules take precedence over allow rules.

## User Segmentation

All data is scoped per user: hosts, rules, and key pairs. Each user has their own isolated set of SSH configurations.

## Database

Database ID: `ssh`

### `ssh_hosts`

| Column       | Type         | Notes                               |
|--------------|--------------|-------------------------------------|
| `user_id`    | varchar(255) | PK (composite) — user identifier    |
| `id`         | varchar(255) | PK (composite) — user-defined ID    |
| `hostname`   | varchar(255) | Hostname or IP address              |
| `port`       | varchar(10)  | SSH port (stored as string)         |
| `username`   | varchar(255) | SSH username                        |
| `created_at` | varchar(255) | ISO 8601 timestamp                  |

### `ssh_rules`

| Column       | Type         | Notes                                    |
|--------------|--------------|------------------------------------------|
| `user_id`    | varchar(255) | PK (composite) — user identifier         |
| `pattern`    | varchar(255) | PK (composite) — command glob pattern    |
| `host`       | varchar(255) | PK (composite) — host ID glob pattern    |
| `type`       | varchar(255) | `'allow'` or `'deny'`                    |
| `created_at` | varchar(255) | ISO 8601 timestamp                       |

### `ssh_keypairs`

| Column        | Type         | Notes                            |
|---------------|--------------|----------------------------------|
| `user_id`     | varchar(255) | PK — user identifier             |
| `private_key` | text         | PEM-encoded PKCS8 private key    |
| `public_key`  | text         | OpenSSH format public key        |
| `created_at`  | varchar(255) | ISO 8601 timestamp               |

## Server Configuration

Disabled by default. Configure via environment variables or config file:

| Environment Variable      | Default | Description                             |
|--------------------------|---------|-----------------------------------------|
| `SSH_ENABLED`            | `false` | Enable/disable the plugin               |
| `SSH_TIMEOUT`            | `30000` | Default command timeout in milliseconds |
| `SSH_MAX_OUTPUT_LENGTH`  | `50000` | Max characters per command              |

## Dependencies

- `@morten-olsen/agentic-core` — plugin, tool, and services types
- `@morten-olsen/agentic-database` — database creation and DatabaseService
- `@morten-olsen/agentic-skill` — skill registration
- `ssh2` — SSH client library
- `zod` — schema validation
