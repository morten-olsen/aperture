# Architecture Overview

This document provides a high-level overview of the agentic framework's architecture.

## Design Philosophy

The framework is built around a plugin-driven architecture where the core handles the agent loop and low-level operations, while all domain-specific functionality is delivered through plugins. The key principles are:

- **Plugin-first** - Everything beyond the basic agent loop is a plugin
- **Type-safe** - Zod schemas validate all data at runtime; TypeScript types are inferred from schemas
- **Dependency injection** - A lightweight `Services` container wires components together
- **Composable** - Plugins contribute tools, context, and state independently

## Package Structure

```
packages/
├── core/           Core agent loop, plugin system, tool framework, state, DI container
├── database/       Database abstraction (Kysely + SQLite) with typed migrations
├── conversation/   Conversation management (history, multi-turn sessions)
├── behaviour/      Behaviour/persona definitions (WIP)
├── skill/          Dynamic skill activation/deactivation plugin
├── trigger/        Scheduled/event-driven trigger plugin
├── server/         Server/API layer (WIP)
├── configs/        Shared TypeScript configuration
└── tests/          Shared test utilities
```

### Dependency Graph

```
                    ┌──────────┐     ┌──────────┐
                    │   core   │     │ database │
                    └────┬─────┘     └─────┬────┘
                         │                 │
           ┌─────────────┼─────────────┐   │
           │             │             │   │
     ┌─────┴─────┐ ┌────┴────┐ ┌─────┴───┴────┐
     │conversation│ │  skill  │ │   trigger     │
     └─────┬─────┘ └─────────┘ └──────────────┘
           │
     ┌─────┴──────┐
     │ playground  │
     └────────────┘
```

## Core Concepts

### Services (Dependency Injection)

The `Services` class is a lazy-instantiating DI container. Services are created on first access and shared as singletons within a container instance. See [Services](./services.md).

### Plugins

Plugins extend the framework with two lifecycle hooks:

- **`setup()`** - Called once at registration time for initialization
- **`prepare()`** - Called before each prompt to contribute tools, context, and state

See [Plugins](./plugins.md).

### Tools

Tools are typed, validated functions that the AI model can call during a conversation. Each tool has a Zod schema for input and output, plus an async `invoke` function. See [Tools](./tools.md).

### Databases

The database layer provides type-safe SQLite access through Kysely, with a migration system scoped per database definition. See [Databases](./databases.md).

### State

State is per-plugin, per-conversation storage validated through each plugin's Zod schema. Tools and plugins read and write state during the agent loop. See [State](./state.md).

## Agent Loop

The core agent loop in `PromptCompletion.run()` follows this cycle:

```
┌─────────────────────────────────────────────┐
│ 1. PREPARE                                  │
│    For each registered plugin:              │
│    - Call plugin.prepare() with context,    │
│      tools[], state, and services           │
│    - Plugins push tools, context items,     │
│      and update state                       │
├─────────────────────────────────────────────┤
│ 2. CALL MODEL                               │
│    - Build messages from context + history  │
│    - Convert tools to OpenAI function format│
│    - Send to model via OpenAI API           │
├─────────────────────────────────────────────┤
│ 3. PROCESS RESPONSE                         │
│    If tool calls:                           │
│      - Validate args with tool.input.parse()│
│      - Call tool.invoke()                   │
│      - On error: format error, record it,  │
│        feed back to model for recovery     │
│      - Record result, loop back to step 1  │
│    If text:                                 │
│      - Record output, mark as completed    │
│      - Exit loop                           │
├─────────────────────────────────────────────┤
│ 4. EVENTS                                   │
│    - Emit 'updated' after each iteration   │
│    - Emit 'completed' when done            │
└─────────────────────────────────────────────┘
```

## Quick Start

```typescript
import { PluginService, Services } from '@morten-olsen/agentic-core';
import { ConversationService } from '@morten-olsen/agentic-conversation';
import { skillPlugin } from '@morten-olsen/agentic-skill';

// 1. Create the DI container
const services = new Services();

// 2. Register plugins
const pluginService = services.get(PluginService);
await pluginService.register(skillPlugin);

// 3. Start a conversation
const conversationService = services.get(ConversationService);
const conversation = await conversationService.get('my-session');

// 4. Send a prompt
const completion = await conversation.prompt({
  input: 'Hello, what can you do?',
  model: 'google/gemini-3-flash-preview',
});

await completion.run();
```

## Further Reading

- [Developer Guide](./developer-guide.md) - Getting started and development workflow
- [Services](./services.md) - Dependency injection container
- [Plugins](./plugins.md) - Writing and registering plugins
- [Tools](./tools.md) - Defining tools for the AI model
- [Databases](./databases.md) - Typed database access with migrations
- [State](./state.md) - Per-plugin conversation state
- [Testing](./testing.md) - Test infrastructure and MSW patterns
