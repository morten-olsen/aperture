# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Living Documents

Both this file and the docs in `docs/` are living documents. When you discover discrepancies between documentation and actual code behavior, update the relevant docs. If something in the codebase is surprising or non-obvious, document it. Changes to architecture or conventions should be reflected in both CLAUDE.md and the appropriate `docs/` file.

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages (uses Turbo, respects dependency order)
pnpm build

# Build in watch mode
pnpm build:dev

# Run all tests (lint + unit)
pnpm test

# Lint only
pnpm test:lint

# Unit tests with coverage
pnpm test:unit

# Run a single package's tests
pnpm --filter @morten-olsen/agentic-core test:unit

# Run a single test file
pnpm vitest --run packages/core/src/some-test.test.ts

# Build a single package
pnpm --filter @morten-olsen/agentic-core build
```

## Architecture

This is a **plugin-driven agentic AI framework**. The core handles the agent loop; everything else is a plugin. Detailed documentation lives in `docs/`.

### Package Dependency Layers

- **Foundation** (no internal deps): `core`, `database`
- **Mid-layer** (depends on foundation): `conversation` → core, `skill` → core, `trigger` → core + database, `behaviour` → core + database, `connection` → core + database
- **Application**: `playground` → conversation + core + trigger
- **Infrastructure**: `configs` (shared tsconfig), `tests` (shared vitest aliases), `server` (WIP)

All packages are `@morten-olsen/agentic-*` scoped. Every package exports through a single `dist/exports.js` entry point.

### Core Concepts

- **Services** (`core/src/utils/utils.service.ts`): Lazy-instantiating DI container. Services are singletons created on first `services.get(ServiceClass)` call. Every service constructor receives the `Services` instance.
- **Plugins** (`core/src/plugin/`): Extend the framework via `setup()` (once at registration) and `prepare()` (before each prompt, to contribute tools, context, and state).
- **Tools** (`core/src/tool/`): Typed functions the AI model can call. Zod schemas for input/output. Created with `createTool()`.
- **State** (`core/src/state/state.ts`): Per-plugin, per-conversation storage keyed by `plugin.id`. Validated against each plugin's Zod schema.
- **Databases** (`database/src/`): Typed SQLite via Kysely. Each plugin defines its own database with `createDatabase()`. All share one in-memory SQLite instance with per-database migration tracking (`_migrations_{id}`).

### Agent Loop Flow

`PromptCompletion.run()` in `core/src/prompt/prompt.completion.ts`:
1. Call `prepare()` on all registered plugins → collects tools, context items, state
2. Convert to OpenAI messages + function definitions
3. Call model via OpenAI SDK (configured by `OPENAI_API_KEY` and `OPENAI_BASE_URL` env vars)
4. If tool calls → validate input with Zod, invoke tool, feed result back, loop to step 1
5. If text → mark completed, exit

### Test Aliasing

Per-package `vitest.config.ts` files use `@morten-olsen/agentic-tests/vitest` to resolve workspace package names to their `src/exports.ts` files, allowing tests to run against source without building first.

## Coding Standards

Full standards are in `docs/coding-standard.md`. The critical rules enforced by ESLint:

- **`type` over `interface`** — enforced by `@typescript-eslint/consistent-type-definitions`
- **No default exports** — enforced by `import/no-default-export`
- **File extensions in imports** — always `.js` in source (NodeNext resolution), enforced by `import/extensions`
- **Exports at end of file** — enforced by `import/exports-last`
- **Import ordering** — groups separated by blank lines: builtin → external → internal → parent → sibling → index

### Additional Conventions (not lint-enforced)

- Arrow functions only (no `function` declarations)
- `#` for private class fields (not `private` keyword)
- Zod for all runtime validation; schemas named `{name}Schema`, types named `{Name}`
- Module structure: `{module}/{module}.ts` as main file, support files as `{module}/{module}.{area}.ts`
- No index files — main module file acts as the public API
- Prefix database table names with plugin/database ID to avoid collisions
- Namespace tool IDs as `{plugin}.{action}` (e.g., `trigger.create`, `skill.activate`)
- Tools referencing their parent plugin use dynamic `import()` to break circular dependencies

## Key Documentation

- `docs/architecture.md` — High-level overview and quick start
- `docs/developer-guide.md` — Getting started, workflow, and conventions
- `docs/services.md` — DI container usage
- `docs/plugins.md` — Writing plugins with lifecycle hooks
- `docs/tools.md` — Defining and registering tools
- `docs/events.md` — Centralized event system, EventService, SSE bridging
- `docs/databases.md` — Database definitions and migrations
- `docs/embeddings.md` — Embedding generation and vector search for plugins
- `docs/state.md` — Per-plugin conversation state
- `docs/connections.md` — Secrets, connections, and agent-driven configuration
- `docs/testing.md` — Test infrastructure, MSW patterns, and conventions
- `docs/coding-standard.md` — Full TypeScript coding standards
- `docs/execution-modes.md` — Pluggable execution modes (classic, code) and how to add new ones
- `docs/deployment.md` — Docker image, configuration, environment variables, persistent state
- `docs/playground-cli.md` — Remote server debugging via CLI
