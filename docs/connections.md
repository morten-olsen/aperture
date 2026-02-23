# Secrets & Connections

Secrets and connections provide agent-driven configuration for external services. Instead of editing config files, users set up integrations through natural conversation. Secrets store sensitive values (API keys, passwords, tokens) that the agent can never read back, while connections are typed entities that reference secrets and describe how to reach an external service.

This is implemented by the `connection` package (`@morten-olsen/agentic-connection`). See [spec 012](../specs/012-agent-driven-configuration.md) for the full design rationale.

## Core Concepts

### Secrets

Secrets are atomic named string values scoped to a user. The agent can create, list, update, and delete secrets but **never read the actual value**. After the user provides a secret value in conversation, no tool ever returns it.

```typescript
type Secret = {
  id: string;         // UUID
  userId: string;
  name: string;       // human-readable label, e.g. "my iCloud app password"
  description?: string;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
};
```

Secret values are stored via the `SecretsProvider` abstraction (see [Storage](#storage) below). The `Secret` type represents only the metadata visible to the agent.

### Connection Types

Plugins register connection types that define what fields a connection needs. Each type has a Zod schema where some fields are plain values and others are secret references.

```typescript
type ConnectionFieldDefinition = {
  schema: ZodType;          // Zod validator for the full fields object
  secretFields: string[];   // Which field names hold secret IDs
};

type ConnectionTypeDefinition = {
  id: string;               // e.g. "caldav", "postgres"
  name: string;             // human-readable, e.g. "CalDAV Calendar"
  description: string;      // shown to the agent
  fields: ConnectionFieldDefinition;
};
```

For example, a calendar plugin registers a `caldav` connection type:

```typescript
connectionService.registerType({
  id: 'caldav',
  name: 'CalDAV Calendar',
  description: 'A CalDAV calendar source (iCloud, Google, Nextcloud, etc.)',
  fields: {
    schema: z.object({
      url: z.string().describe('CalDAV server URL'),
      username: z.string().describe('CalDAV username'),
      passwordSecretId: z.string().describe('Secret ID for the CalDAV password'),
    }),
    secretFields: ['passwordSecretId'],
  },
});
```

### Connections

Connections are typed entities scoped to a user. They reference a connection type and store both plain values and secret references in a `fields` object.

```typescript
type Connection = {
  id: string;
  userId: string;
  type: string;                        // Connection type ID
  name: string;                        // User-facing label
  fields: Record<string, unknown>;     // Plain values + secret ID references
  createdAt: string;
  updatedAt: string;
};
```

## ConnectionService

The `ConnectionService` is the central service for managing connection types, connections, and secret resolution.

```typescript
import { ConnectionService } from '@morten-olsen/agentic-connection';

const connectionService = services.get(ConnectionService);
```

### Methods

| Method | Description |
|--------|-------------|
| `registerType(definition)` | Register a connection type (called by plugins in `setup()`) |
| `listTypes()` | List all registered connection types |
| `getType(id)` | Get a single type by ID |
| `create(userId, { type, name, fields })` | Create a connection, validating fields against the type schema |
| `get(userId, id)` | Get a connection by ID (fields contain secret references, not values) |
| `list(userId, type?)` | List connections, optionally filtered by type |
| `update(userId, id, { name?, fields? })` | Update a connection's name or fields |
| `delete(userId, id)` | Delete a connection |
| `resolve(userId, id)` | Resolve secret references to actual values (service-layer only, never exposed to agent) |
| `findBySecretId(userId, secretId)` | Find all connections that reference a given secret |

### Resolving Secrets

The `resolve()` method is the bridge between connections and actual credentials. It looks up the connection type's `secretFields`, fetches each referenced secret value from `SecretsProvider`, and returns the fields object with IDs replaced by real values.

```typescript
// In a plugin's tool that needs actual credentials
const resolved = await connectionService.resolve(userId, connectionId);
// resolved = { url: "https://...", username: "alice", passwordSecretId: "actual-password-value" }
```

`resolve()` is only called by plugin/service code. It is never exposed as a tool — the agent never sees secret values after the initial user message.

## Secret Name Resolution

When creating or updating a connection, secret fields accept **either a UUID or a secret name**. If the value is not a UUID, `ConnectionService` looks it up by name in the user's secrets and replaces it with the matching UUID before storing.

```typescript
// Both of these work:
await connectionService.create(userId, {
  type: 'caldav',
  name: 'Work Calendar',
  fields: {
    url: 'https://caldav.icloud.com',
    username: 'alice@icloud.com',
    passwordSecretId: 'sec_abc-123-...',           // UUID — stored as-is
  },
});

await connectionService.create(userId, {
  type: 'caldav',
  name: 'Work Calendar',
  fields: {
    url: 'https://caldav.icloud.com',
    username: 'alice@icloud.com',
    passwordSecretId: 'iCloud app password',        // Name — resolved to UUID
  },
});
```

This allows the agent to reference secrets by the human-readable name shown in `configuration.secrets.list`, without needing to remember UUIDs.

## Tools

All tools are registered as a skill (`"configuration"`) so they stay out of daily context. The agent activates this skill when the user asks to configure integrations.

### Secret Tools

| Tool ID | Input | Output | Description |
|---------|-------|--------|-------------|
| `configuration.secrets.create` | `{ name, value, description? }` | `{ id, name }` | Create a new secret |
| `configuration.secrets.list` | `{}` | `{ secrets: [{ id, name, description?, createdAt, updatedAt }] }` | List metadata (no values) |
| `configuration.secrets.update` | `{ id, name?, description?, value? }` | `{ id, updated }` | Update metadata or value |
| `configuration.secrets.delete` | `{ id }` | `{ deleted, affectedConnections: [{ id, name, type }] }` | Delete and warn about broken refs |
| `configuration.secrets.verify` | `{ id }` | `{ id, exists, hasValue, valueLength }` | Check if a secret has a non-empty value (never exposes the value) |

### Connection Tools

| Tool ID | Input | Output | Description |
|---------|-------|--------|-------------|
| `configuration.connections.types` | `{}` | `{ types: [{ id, name, description, secretFields }] }` | List available connection types |
| `configuration.connections.create` | `{ type, name, fields }` | `{ id, type, name }` | Create a connection |
| `configuration.connections.list` | `{ type? }` | `{ connections: [{ id, type, name, createdAt, updatedAt }] }` | List connections |
| `configuration.connections.get` | `{ id }` | `{ connection: { id, type, name, fields, ... } \| null }` | Get connection details |
| `configuration.connections.update` | `{ id, name?, fields? }` | `{ id, updated }` | Update a connection |
| `configuration.connections.delete` | `{ id }` | `{ deleted }` | Delete a connection |
| `configuration.connections.diagnose` | `{ id }` | `{ id, type, name, fields: [{ field, isSecret, hasValue, valueLength, storedRaw? }] }` | Diagnose resolved fields without exposing secrets |

## Plugin Setup

The connection plugin initializes both databases, registers the `SecretsProviderDatabase`, registers all tools via `ToolRegistry`, and creates the `"configuration"` skill:

```typescript
import { connectionPlugin } from '@morten-olsen/agentic-connection';

await pluginService.register(connectionPlugin);
```

The skill instruction tells the agent how to orchestrate the tools — list secrets first, check available connection types, create secrets before connections, etc.

## Storage

### Secret Values — `SecretsProvider`

The `SecretsProvider` interface abstracts secret value storage. A SQLite-backed implementation (`SecretsProviderDatabase`) is the default. It is registered on `services.secrets` during plugin setup.

```typescript
type SecretsProvider = {
  list(userId: string): Promise<Secret[]>;
  set(userId: string, secret: Secret, value: string): Promise<void>;
  get(userId: string, id: string): Promise<string | undefined>;
  update(userId: string, id: string, changes: { name?; description?; value? }): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
};
```

Operators who need stronger guarantees (encryption at rest, audit logging, key rotation) can replace the provider in the DI container:

```typescript
services.set(SecretsProvider, new VaultSecretsProvider({ url: '...' }));
```

### Database Tables

Two databases are created:

**`secrets` database** — `secrets_values` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) | PK — UUID |
| `user_id` | varchar(255) | Owner |
| `name` | varchar(255) | Human-readable label |
| `description` | text | Optional |
| `value` | text | The actual secret value |
| `created_at` | text | ISO 8601 |
| `updated_at` | text | ISO 8601 |

**`connections` database** — `connections_connections` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) | PK — UUID |
| `user_id` | varchar(255) | Owner |
| `type` | varchar(255) | Connection type ID |
| `name` | varchar(255) | User-facing label |
| `fields` | text | JSON-serialized fields object |
| `created_at` | text | ISO 8601 |
| `updated_at` | text | ISO 8601 |

## Consuming Connections in Plugins

Plugins query connections in their `prepare()` or tool `invoke()` functions:

```typescript
// In a calendar plugin's prepare()
const connectionService = services.get(ConnectionService);
const calendarConnections = await connectionService.list(userId, 'caldav');

// Only offer calendar tools if the user has calendar connections
if (calendarConnections.length === 0) return;

// In a tool that needs actual credentials
const resolved = await connectionService.resolve(userId, connectionId);
// Use resolved.url, resolved.username, resolved.passwordSecretId (now the real password)
```

## Example Flow

A typical conversation where the user sets up a calendar integration:

```
User: "I want to add my work calendar. It's on iCloud."

Agent: activates "configuration" skill
Agent: calls configuration.secrets.list → no existing secrets
Agent: "I'll need your iCloud credentials. What's your Apple ID email?"

User: "alice@icloud.com"

Agent: "And the app-specific password for CalDAV access?"

User: "xxxx-xxxx-xxxx-xxxx"

Agent: calls configuration.secrets.create({
  name: "iCloud app password",
  value: "xxxx-xxxx-xxxx-xxxx",
  description: "App-specific password for iCloud services"
})
→ { id: "sec_abc", name: "iCloud app password" }

Agent: calls configuration.connections.create({
  type: "caldav",
  name: "Work Calendar",
  fields: {
    url: "https://caldav.icloud.com/alice@icloud.com/calendars/work/",
    username: "alice@icloud.com",
    passwordSecretId: "sec_abc"
  }
})

Agent: "Done! Your work calendar is connected."
```

## File Organization

```
packages/connection/src/
├── exports.ts                          Package public API
├── plugin/
│   └── plugin.ts                       Plugin definition (setup, skill registration)
├── service/
│   ├── service.ts                      ConnectionService implementation
│   ├── service.types.ts                Type definitions
│   └── service.test.ts                 Tests for resolve, secret name resolution
├── secrets/
│   └── secrets.database.ts             SecretsProviderDatabase implementation
├── database/
│   └── database.ts                     Database definitions and migrations
└── tools/
    ├── tools.ts                        Tool exports (secretTools, connectionTools)
    ├── tools.secrets.create.ts         configuration.secrets.create
    ├── tools.secrets.list.ts           configuration.secrets.list
    ├── tools.secrets.update.ts         configuration.secrets.update
    ├── tools.secrets.delete.ts         configuration.secrets.delete
    ├── tools.secrets.verify.ts         configuration.secrets.verify
    ├── tools.connections.types.ts      configuration.connections.types
    ├── tools.connections.create.ts     configuration.connections.create
    ├── tools.connections.list.ts       configuration.connections.list
    ├── tools.connections.get.ts        configuration.connections.get
    ├── tools.connections.update.ts     configuration.connections.update
    ├── tools.connections.delete.ts     configuration.connections.delete
    └── tools.connections.diagnose.ts   configuration.connections.diagnose
```

## Design Guidelines

1. **Secrets are flat strings, not typed** — A secret is always a single sensitive value. The connection is where structure lives. This keeps the secrets layer simple and universally reusable.

2. **Composition over nesting** — A secret is referenced by a connection, not embedded in it. One secret can be used by multiple connections, matching how users think about their credentials.

3. **Agent never reads secret values** — The `create` tool accepts a value, but no tool returns values. The `resolve()` method is service-layer only. This is a hard boundary.

4. **Skill-gated tools** — Configuration is infrequent. Putting these tools in every prompt wastes context tokens. The skill system activates them on demand.

5. **Plugins own their connection types** — Each plugin knows what external services it can talk to. Centralizing type definitions would create a bottleneck.

6. **Lazy dynamic imports in tools** — All tool files use `await import('../service/service.js')` to break circular dependencies with `ConnectionService`.

7. **User isolation** — All queries include `user_id` checks. Each user has their own secrets and connections.

## Troubleshooting Connections

### Diagnostic Workflow

When a connection fails (e.g. "Invalid credentials"), use the diagnostic tools to narrow down the cause:

```bash
# 1. Check if the secret has a non-empty value
invoke configuration.secrets.verify '{"id":"<secret-uuid>"}'
# → { exists: true, hasValue: true, valueLength: 16 }

# 2. Check all resolved fields of the connection
invoke configuration.connections.diagnose '{"id":"<connection-id>"}'
# → Shows each field's hasValue and valueLength (secrets hidden, non-secrets shown in full)

# 3. Try a manual sync to see the exact error
invoke calendar.sync '{"calendarId":"<connection-id>"}'
```

If `hasValue: true` and `valueLength > 0` for all fields, the credential resolution chain is working — the issue is likely wrong URLs or wrong credentials, not a code bug.

### CalDAV URL Reference

The `tsdav` library throws a generic `"Invalid credentials"` error on any HTTP 401. This can be caused by wrong server URLs (server returns 401 on unknown paths), not just wrong passwords. Always verify URLs first.

| Provider | CalDAV Server URL | Notes |
|----------|-------------------|-------|
| Google | `https://apidata.googleusercontent.com/calendar/dav` | Requires a Google App Password (not OAuth). Do NOT use `/caldav/v2/` paths. |
| iCloud | `https://caldav.icloud.com` | Requires an Apple App-Specific Password. Username is the Apple ID email. |
| Nextcloud | `https://<host>/remote.php/dav` | Regular account password works. |

### Common Pitfalls

- **tsdav "Invalid credentials"** — This is a generic HTTP 401 error. Wrong URLs, wrong usernames, and expired app passwords all produce this same message. Use the diagnostic tools to verify credentials are non-empty, then check URLs.
- **Empty secret values** — If the frontend doesn't pass the secret value during creation, it gets stored as an empty string. `secrets.verify` will show `valueLength: 0`.
- **Google CalDAV URL confusion** — Google has multiple CalDAV-related paths (`/caldav/v2/`, `/calendar/dav/`). The correct one for `tsdav` with Basic auth is `https://apidata.googleusercontent.com/calendar/dav`.
- **Apple App Passwords** — Format is `xxxx-xxxx-xxxx-xxxx`. Some clients work with or without dashes; store the full format with dashes to be safe.
