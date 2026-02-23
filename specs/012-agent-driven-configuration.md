# 012: Agent-Driven Configuration

**Status**: Draft

## Overview

Today, all plugin configuration lives in a static convict config loaded at startup from environment variables and JSON files. Secrets (API keys, passwords, tokens) sit alongside behavioral settings, everything is global, and there is no per-user dimension. This spec introduces an agent-driven configuration model where users configure integrations through natural conversation rather than editing config files.

The design introduces three new primitives:

- **Secrets** — named, opaque string values the agent can never read
- **Connections** — typed, composable entities that reference secrets and describe how to reach an external service
- **Plugin activation** — per-user flags controlling which plugins participate in each conversation turn

Together these allow a user to say "connect my work calendar using my iCloud credentials" and have the agent wire everything up — without ever seeing the actual password.

## Goals

- Users configure integrations conversationally ("set up my calendar", "add my postgres database")
- Secrets are stored securely and never exposed to the agent/LLM
- Connections are composable: one secret can be referenced by many connections
- Plugins discover their configuration dynamically by querying connections
- Per-user scoping — each user has their own secrets, connections, and plugin activation state
- Configuration tools stay out of daily context via the skill system
- Operator retains control over infrastructure and can lock critical plugins

## Non-Goals

- OAuth2 interactive flows (future work — for now, users provide tokens/credentials directly)
- Sharing secrets or connections across users
- Per-user behavioral settings (plugins hardcode sane defaults for now)
- Migrating Telegram bot setup to dynamic config (remains operator-level)
- User registration / identity management

---

## Data Model

### Secrets

Secrets are atomic named string values, scoped to a user. The agent can create, list, and delete secrets but **never read the actual value**.

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

The actual secret value is stored separately via the `SecretsProvider` abstraction (see Storage section). The `Secret` type represents only the metadata visible to the agent.

### Connection Types

Plugins register connection types that define what fields a connection needs. Each type has a Zod schema where fields are either plain values or secret references.

```typescript
type ConnectionFieldSchema = {
  /** Zod schema for the full connection fields */
  schema: ZodType;
  /** Which field names hold secret references (secretId strings) */
  secretFields: string[];
};

type ConnectionTypeDefinition = {
  id: string;              // e.g. "postgres", "caldav", "home-assistant"
  name: string;            // human-readable, e.g. "PostgreSQL Database"
  description: string;     // shown to the agent when listing available types
  fields: ConnectionFieldSchema;
};
```

Example — a `caldav` connection type registered by the calendar plugin:

```typescript
{
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
}
```

### Connections

Connections are typed entities scoped to a user. They reference a connection type and store both plain configuration values and secret references.

#### Database Table: `connections_connections`

| Column       | Type         | Notes                                              |
|--------------|--------------|----------------------------------------------------|
| `id`         | varchar(255) | PK — UUID                                          |
| `user_id`    | varchar(255) | Owner                                              |
| `type`       | varchar(255) | Connection type ID (e.g. `caldav`, `postgres`)     |
| `name`       | varchar(255) | User-facing label (e.g. "Work Calendar")           |
| `fields`     | text         | JSON object with plain values + secret references  |
| `created_at` | varchar(255) | ISO 8601                                           |
| `updated_at` | varchar(255) | ISO 8601                                           |

Database ID: `connections`

### Plugin Activation

Per-user flags controlling whether a plugin's `prepare()` runs for that user's conversations.

#### Database Table: `connections_plugin_activation`

| Column       | Type         | Notes                                              |
|--------------|--------------|----------------------------------------------------|
| `user_id`    | varchar(255) | Composite PK with `plugin_id`                      |
| `plugin_id`  | varchar(255) | Composite PK with `user_id`                        |
| `enabled`    | boolean      | User's preference                                  |
| `updated_at` | varchar(255) | ISO 8601                                           |

Plugins declare their activation behavior at registration:

```typescript
type PluginActivationConfig = {
  /** Default state for new users. Operator can override via static config. */
  defaultEnabled: boolean;
  /** If true, the user cannot disable this plugin. */
  locked: boolean;
};
```

Locked plugins (e.g., `conversation`, `database`, `telegram`) cannot be disabled — they are infrastructure the system depends on.

Resolution order: locked → user override → operator default → plugin default.

---

## Service Layer

### `SecretsProvider` (interface — already exists in core)

Abstraction for secret value storage. The provider stores and retrieves raw secret values by ID. The existing interface is extended to support user scoping:

```typescript
type SecretsProvider = {
  list: (userId: string) => Promise<SecretMetadata[]>;
  set: (userId: string, secret: SecretMetadata, value: string) => Promise<void>;
  get: (userId: string, id: string) => Promise<string | undefined>;
  update: (userId: string, id: string, changes: { name?: string; description?: string; value?: string }) => Promise<void>;
  remove: (userId: string, id: string) => Promise<void>;
};
```

A SQLite-backed implementation (`SecretsProviderDatabase`) is the default. Operators can swap in vault-backed implementations (HashiCorp Vault, AWS Secrets Manager, etc.) via the DI container.

### `ConnectionService`

Central service for managing connections and resolving secret references.

```
class ConnectionService {
  constructor(services: Services)

  // --- Connection type registry ---

  /** Plugins call this to register a connection type */
  registerType(definition: ConnectionTypeDefinition): void

  /** List all registered connection types */
  listTypes(): ConnectionTypeDefinition[]

  // --- Connection CRUD ---

  /** Create a connection, validating fields against the type schema */
  create(userId: string, input: {
    type: string;
    name: string;
    fields: Record<string, unknown>;
  }): Promise<Connection>

  /** Get a connection by ID (fields contain secret references, not values) */
  get(userId: string, id: string): Promise<Connection | undefined>

  /** List connections, optionally filtered by type */
  list(userId: string, type?: string): Promise<Connection[]>

  /** Update a connection's name or fields */
  update(userId: string, id: string, changes: {
    name?: string;
    fields?: Record<string, unknown>;
  }): Promise<Connection>

  /** Delete a connection */
  delete(userId: string, id: string): Promise<void>

  // --- Secret resolution ---

  /**
   * Resolve a connection's secret references into actual values.
   * Returns the fields object with secretId references replaced by the
   * actual secret values. Only called by plugin/service code, never
   * exposed to the agent.
   */
  resolve(userId: string, id: string): Promise<Record<string, unknown>>
}
```

### `PluginActivationService`

Manages per-user plugin activation state.

```
class PluginActivationService {
  constructor(services: Services)

  /** Check if a plugin is active for a user */
  isActive(userId: string, pluginId: string): Promise<boolean>

  /** Set a user's preference (fails for locked plugins) */
  setActive(userId: string, pluginId: string, enabled: boolean): Promise<void>

  /** List plugins with their activation state for a user */
  list(userId: string): Promise<{
    pluginId: string;
    name: string;
    description: string;
    enabled: boolean;
    locked: boolean;
  }[]>
}
```

---

## Tool Definitions

All tools are registered as a **skill** (`"configuration"`) to avoid bloating daily context. The agent activates this skill when the user asks to configure integrations.

### Secrets

#### `configuration.secrets.create`

Create a new secret. The agent collects the value from the user and passes it through — the value is stored but never returned to the agent afterward.

- **Input**: `{ name: string, value: string, description?: string }`
- **Output**: `{ id: string, name: string }`

#### `configuration.secrets.list`

List all secrets for the current user (metadata only, no values).

- **Input**: `{}`
- **Output**: `{ secrets: { id, name, description }[] }`

#### `configuration.secrets.update`

Update a secret's value (and optionally name/description). The secret ID remains stable so all connections referencing it continue to work.

- **Input**: `{ id: string, value?: string, name?: string, description?: string }`
- **Output**: `{ id: string, name: string }`

#### `configuration.secrets.delete`

Delete a secret. Warns if connections reference it.

- **Input**: `{ id: string }`
- **Output**: `{ deleted: boolean, affectedConnections: string[] }`

### Connections

#### `configuration.connections.types`

List all available connection types and their field schemas.

- **Input**: `{}`
- **Output**: `{ types: { id, name, description, fields: { schema description } }[] }`

#### `configuration.connections.create`

Create a new connection of a given type.

- **Input**: `{ type: string, name: string, fields: Record<string, unknown> }`
- **Output**: `{ id, type, name, fields, createdAt }`

#### `configuration.connections.list`

List connections, optionally filtered by type.

- **Input**: `{ type?: string }`
- **Output**: `{ connections: { id, type, name, fields, createdAt }[] }`

#### `configuration.connections.get`

Get a specific connection's details.

- **Input**: `{ id: string }`
- **Output**: `{ id, type, name, fields, createdAt, updatedAt }`

#### `configuration.connections.update`

Update a connection's name or fields.

- **Input**: `{ id: string, name?: string, fields?: Record<string, unknown> }`
- **Output**: `{ id, type, name, fields, updatedAt }`

#### `configuration.connections.delete`

Delete a connection.

- **Input**: `{ id: string }`
- **Output**: `{ deleted: boolean }`

### Plugin Activation

#### `configuration.plugins.list`

List all plugins with their activation state.

- **Input**: `{}`
- **Output**: `{ plugins: { id, name, description, enabled, locked }[] }`

#### `configuration.plugins.set`

Enable or disable a plugin for the current user. Fails for locked plugins.

- **Input**: `{ pluginId: string, enabled: boolean }`
- **Output**: `{ pluginId, enabled }`

---

## Plugin Behavior

### Registration

The configuration plugin registers with the skill system:

```typescript
skillService.registerSkill({
  id: 'configuration',
  description: 'Manage secrets, connections, and plugin activation. Activate this when the user wants to set up or modify integrations.',
  instruction: `You can manage the user's integration configuration:
- Secrets: store sensitive values (passwords, API keys, tokens). You can create and delete secrets but never read their values.
- Connections: typed configurations that reference secrets. Each connection type defines what fields are needed.
- Plugins: enable or disable plugins for this user.

When setting up a new integration:
1. Check if the user already has relevant secrets (configuration.secrets.list)
2. List available connection types (configuration.connections.types)
3. Create any needed secrets first (configuration.secrets.create)
4. Create the connection referencing those secrets (configuration.connections.create)`,
  tools: [...secretTools, ...connectionTools, ...pluginActivationTools],
});
```

### Plugin `prepare()` Integration

The plugin activation system integrates with the existing `prepare()` lifecycle:

1. Before calling a plugin's `prepare()`, the framework checks `PluginActivationService.isActive(userId, pluginId)`
2. If inactive (and not locked), the plugin's `prepare()` is skipped — its tools and context are not included
3. Locked plugins always run `prepare()` regardless of user preference

### Connection Consumption by Plugins

Plugins query connections in their `prepare()` or tool `invoke()` functions:

```typescript
// In calendar plugin's prepare()
const connectionService = services.get(ConnectionService);
const calendarConnections = await connectionService.list(userId, 'caldav');

// Only run calendar sync if the user has calendar connections
if (calendarConnections.length === 0) return;

// In a tool that needs the actual credentials
const resolved = await connectionService.resolve(userId, connectionId);
// resolved = { url: "https://...", username: "alice", passwordSecretId: "actual-password-value" }
```

Note: `resolve()` replaces the secret reference field values with actual secret values. The field names stay the same (e.g., `passwordSecretId` still holds the key, but its value becomes the resolved secret). Plugins know which fields are secrets from the connection type definition.

---

## Example Flow

### User sets up a work calendar

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

Agent: calls configuration.plugins.set({ pluginId: "calendar", enabled: true })

Agent: "Done! Your work calendar is connected. I'll sync it automatically."
```

### User queries a database

```
User: "I need to check the orders table on our prod database.
       Use my postgres credentials and connect to db.example.com:5432/shopdb"

Agent: activates "configuration" skill
Agent: calls configuration.secrets.list → sees "postgres prod password"
Agent: calls configuration.connections.create({
  type: "postgres",
  name: "Shop Production DB",
  fields: {
    host: "db.example.com",
    port: 5432,
    database: "shopdb",
    username: "alice",
    passwordSecretId: "sec_xyz"
  }
})

Agent: deactivates "configuration" skill
Agent: calls sql.query({
  connectionId: "conn_123",
  query: "SELECT * FROM orders ORDER BY created_at DESC LIMIT 10"
})
```

---

## What Stays in Static Config

These remain in the convict config file / environment variables (operator concerns):

| Setting | Reason |
|---------|--------|
| `openai.apiKey`, `openai.baseUrl` | LLM provider — infrastructure |
| `model.normal`, `model.high` | Model selection — infrastructure |
| `database.location` | SQLite file path — infrastructure |
| `embeddings.*` | Vector infra — infrastructure |
| `api.port`, `api.host`, `api.corsOrigin` | Server networking — infrastructure |
| `telegram.token`, `telegram.users` | Bot identity — operator concern |

Everything else moves out of static config. Plugin `enabled` flags are removed — all plugins are always registered. User-facing configuration happens through connections and plugin activation.

---

## Storage

### Secret Values — `SecretsProvider`

The `SecretsProvider` interface (already in core) is the abstraction for secret value storage. This spec adds a `SecretsProviderDatabase` implementation backed by SQLite as the default.

#### Database Table: `secrets_values`

| Column       | Type         | Notes                                              |
|--------------|--------------|----------------------------------------------------|
| `id`         | varchar(255) | PK — matches the secret metadata ID                |
| `user_id`    | varchar(255) | Owner                                              |
| `name`       | varchar(255) | Human-readable label                               |
| `description`| text         | Optional description                               |
| `value`      | text         | The actual secret value                            |
| `created_at` | varchar(255) | ISO 8601                                           |
| `updated_at` | varchar(255) | ISO 8601                                           |

Database ID: `secrets`

Operators who need stronger guarantees (encryption at rest, audit logging, key rotation) can replace the provider in the DI container:

```typescript
services.set(SecretsProvider, new VaultSecretsProvider({ url: '...' }));
```

### Connections & Plugin Activation — Database

Connections and plugin activation use the standard `createDatabase()` pattern with a single database ID: `connections`.

---

## Migration Strategy

This is a significant shift. To avoid a big-bang migration:

1. **Phase 1**: Implement secrets, connections, and connection types in core/database. Ship the `ConnectionService` and `SecretsProviderDatabase`. Add the configuration skill with tools. Plugins can start registering connection types.
2. **Phase 2**: Migrate individual plugins to query connections instead of reading static config. Start with calendar and home-assistant as proof-of-concept. Plugins fall back to static config if no connections exist (backward compat).
3. **Phase 3**: Add plugin activation system. Remove `enabled` flags from static config. Add locked plugin support.

Each phase is independently shippable and testable.

---

## Design Decisions

1. **Secrets as flat strings, not typed** — A secret is always a single sensitive value (a password, a token, a key). Typing secrets (e.g., "this is an OAuth token") adds schema complexity without clear benefit. The *connection* is where structure lives. This keeps the secrets layer dead simple and universally reusable.

2. **Connections over plugin-specific config** — Rather than each plugin having its own configuration store, connections provide a uniform model. The calendar plugin doesn't store "calendar sources" — it queries `caldav` connections. This means the agent learns one system (secrets + connections) and can configure any plugin.

3. **Composition over nesting** — A secret is referenced by a connection, not embedded in it. One "iCloud app password" secret can be used by a CalDAV connection, a Reminders connection, and a Contacts connection. This matches how users actually think about their credentials.

4. **Agent never reads secret values** — The `create` tool accepts a value (the user provides it in conversation), but no tool returns secret values. The `resolve()` method is service-layer only. This is a hard boundary — the LLM context never contains secret values after the initial user message.

5. **Skill-gated tools** — Configuration is infrequent. Putting these tools in every prompt wastes context tokens on most turns. The skill system already exists for exactly this pattern — activate on demand, deactivate when done.

6. **Plugins always registered, activation per-user** — This eliminates the static `enabled` flag dance. An operator deploys with all capabilities; users choose what's active for them. Locked plugins prevent users from breaking their own communication channel.

7. **SQLite default for secrets with pluggable provider** — Most deployments don't need Vault. SQLite is already the storage backend, and disk encryption handles at-rest security for typical setups. The provider interface exists as an escape hatch, not a requirement.

8. **Connection types registered by plugins** — Each plugin knows what external services it can talk to and what fields it needs. Centralizing type definitions would create a maintenance bottleneck. Plugins own their connection types just like they own their tools.

9. **Phased migration** — Plugins can adopt connections incrementally, falling back to static config. This avoids a flag day and lets us validate the model with one or two plugins before committing fully.
