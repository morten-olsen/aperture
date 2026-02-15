# Services

The `Services` class is the framework's dependency injection container. It provides lazy-instantiated, singleton service access across the system.

## How It Works

```typescript
import { Services } from '@morten-olsen/agentic-core';

const services = new Services();
```

When you call `services.get(SomeService)`, the container:

1. Checks if an instance already exists for that service class
2. If not, creates one by calling `new SomeService(services)`
3. Caches and returns the instance

This means services are created on first access and reused for subsequent calls.

## Writing a Service

A service is any class whose constructor accepts a `Services` instance. The constructor receives the container so it can access other services.

```typescript
import type { Services } from '@morten-olsen/agentic-core';

class UserService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  public getUser = async (id: string) => {
    // Implementation
  };
}

export { UserService };
```

### Accessing Other Services

Services can depend on each other through the container:

```typescript
import { DatabaseService } from '@morten-olsen/agentic-database';
import type { Services } from '@morten-olsen/agentic-core';

class TriggerService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  public get = async (id: string) => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(triggerDatabase);
    return db.selectFrom('triggers').where('id', '=', id).executeTakeFirst();
  };
}

export { TriggerService };
```

Dependencies are resolved lazily - `DatabaseService` is only instantiated when `get()` is first called.

### Cleanup with `destroy`

Services that hold resources (database connections, timers, subscriptions) can implement cleanup via the `destroy` symbol:

```typescript
import { destroy, type Services } from '@morten-olsen/agentic-core';

class ConnectionPool {
  #pool: Pool;

  constructor(services: Services) {
    this.#pool = createPool();
  }

  [destroy] = async () => {
    await this.#pool.close();
  };
}

export { ConnectionPool };
```

When `services.destroy()` is called, all registered services with a `[destroy]` method are cleaned up.

## Using Services

### Retrieving a Service

```typescript
const services = new Services();

// First call creates the instance
const userService = services.get(UserService);

// Second call returns the same instance
const sameInstance = services.get(UserService);
// userService === sameInstance
```

### Pre-configuring a Service

Use `set()` to register a pre-configured instance before it's first accessed:

```typescript
const services = new Services();

// Pre-configure with a partial or mock instance
services.set(DatabaseService, customDatabaseService);

// Subsequent get() calls return the pre-configured instance
const db = services.get(DatabaseService);
```

This is useful for testing or when a service needs configuration that can't be done through the constructor alone.

### Lifecycle

```typescript
const services = new Services();

// Use services throughout your application...
const pluginService = services.get(PluginService);
const conversationService = services.get(ConversationService);

// When shutting down, clean up all services
await services.destroy();
```

## Services in the Framework

The framework ships with these services:

| Service | Package | Purpose |
|---------|---------|---------|
| `PluginService` | `@morten-olsen/agentic-core` | Registers and manages plugins |
| `PromptService` | `@morten-olsen/agentic-core` | Creates prompt completions |
| `DatabaseService` | `@morten-olsen/agentic-database` | Manages database instances and migrations |
| `ConversationService` | `@morten-olsen/agentic-conversation` | Manages conversation sessions |
| `SkillService` | `@morten-olsen/agentic-skill` | Registers and manages skills |
| `TriggerService` | `@morten-olsen/agentic-trigger` | Manages trigger definitions |

## Services in Plugins

Services are available in both plugin lifecycle hooks:

```typescript
const myPlugin = createPlugin({
  id: 'my-plugin',
  state: z.unknown(),
  setup: async ({ services }) => {
    // Access services during initialization
    const db = services.get(DatabaseService);
  },
  prepare: async ({ services }) => {
    // Access services before each prompt
    const skillService = services.get(SkillService);
  },
});
```

## Services in Tools

Tools also receive the services container:

```typescript
const myTool = createTool({
  id: 'my-tool',
  description: 'Does something',
  input: z.object({ query: z.string() }),
  output: z.object({ result: z.string() }),
  invoke: async ({ input, services }) => {
    const myService = services.get(MyService);
    const result = await myService.search(input.query);
    return { result };
  },
});
```

## Design Notes

- Services are **singletons** within a container - one instance per service class
- Instantiation is **lazy** - services are only created when first accessed
- Dependencies form a **graph**, not a tree - services can access any other service
- The container is **not** globally scoped - you can create multiple independent containers
