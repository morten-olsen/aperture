# Developer Guide

This guide covers everything needed to work on the framework: setting up the repo, understanding the development workflow, and following the project conventions.

## Prerequisites

- **Node.js** — LTS or current
- **pnpm** — v10.6.0+ (`corepack enable` to use the version pinned in `package.json`)

## Setup

```bash
git clone <repo-url>
cd glados
pnpm install
pnpm build        # Build all packages (Turbo handles dependency order)
pnpm test         # Verify everything works (lint + unit tests)
```

## Development Workflow

### Building

```bash
pnpm build          # Full build (all packages, respects dependency order)
pnpm build:dev      # Watch mode — rebuilds on changes
pnpm --filter @morten-olsen/agentic-core build   # Single package
```

The build uses Turbo to parallelize and respect dependency order. Each package compiles with `tsc --build` and outputs to `dist/`.

### Testing

```bash
pnpm test           # Lint + unit tests
pnpm test:lint      # ESLint only
pnpm test:unit      # Vitest with coverage
```

Tests run against source files directly (no build step needed) thanks to vitest path aliasing. See [Testing](./testing.md) for patterns and conventions.

### Watch Mode

For active development, run the build watcher and test watcher in separate terminals:

```bash
# Terminal 1: watch builds
pnpm build:dev

# Terminal 2: watch tests for a specific package
pnpm vitest packages/core/src/
```

## Package Structure

Every package follows a consistent layout:

```
packages/{name}/
├── src/
│   ├── {module}/
│   │   ├── {module}.ts              # Main module file (public API)
│   │   ├── {module}.{area}.ts       # Supporting files
│   │   └── {module}.test.ts         # Tests (excluded from build)
│   └── exports.ts                   # Single entry point re-exporting all modules
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

- **No index files** — The main module file (`{module}.ts`) acts as the public API
- **Single entry point** — All packages export through `dist/exports.js`
- **Test files colocated** — Tests live next to the code they test

## Coding Conventions

These are enforced by ESLint where possible. See `docs/coding-standard.md` for the full list.

### Must-follow (lint-enforced)

- **`type` over `interface`** for all type definitions
- **No default exports** — use named exports only
- **File extensions in imports** — always `.js` (NodeNext module resolution)
- **Exports at end of file** — all `export` statements go last
- **Import ordering** — groups separated by blank lines: builtin → external → parent → sibling

### Conventions (not lint-enforced)

- **Arrow functions only** — no `function` declarations
- **`#` for private fields** — not the `private` keyword
- **Zod for validation** — schemas named `{name}Schema`, types named `{Name}`
- **Namespace tool IDs** — `{plugin}.{action}` (e.g., `trigger.create`)

## Adding a New Package

1. Create `packages/{name}/` with `package.json`, `tsconfig.json`, `vitest.config.ts`
2. Name the package `@morten-olsen/agentic-{name}`
3. Set up the standard structure: `src/exports.ts` as entry point
4. Add `"@morten-olsen/agentic-tests": "workspace:*"` to devDependencies
5. Copy the vitest config pattern (uses `getAliases()` for import resolution)
6. Exclude test files from tsconfig: `"exclude": ["src/**/*.test.ts"]`
7. Run `pnpm install` to link workspace dependencies

### tsconfig.json template

```json
{
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"],
  "extends": "@morten-olsen/agentic-configs/tsconfig.json"
}
```

### vitest.config.ts template

```typescript
import { defineConfig } from 'vitest/config';
import { getAliases } from '@morten-olsen/agentic-tests/vitest';

export default defineConfig(async () => {
  const aliases = await getAliases();
  return {
    resolve: {
      alias: aliases,
    },
  };
});
```

## Adding a New Plugin

Plugins are the primary extension mechanism. See [Plugins](./plugins.md) for the full guide. The short version:

1. Create the plugin with `createPlugin()` — give it a unique `id` and a `state` schema
2. Add tools with `createTool()` — namespace IDs as `{plugin}.{action}`
3. Register tools in `prepare()` rather than statically
4. Add context items for system instructions
5. Register the plugin via `PluginService.register()`

## Key Files

| Path | Purpose |
|------|---------|
| `packages/core/src/prompt/prompt.completion.ts` | Agent loop implementation |
| `packages/core/src/plugin/` | Plugin system (types, service, prepare) |
| `packages/core/src/tool/` | Tool definition and types |
| `packages/core/src/state/state.ts` | Per-plugin state management |
| `packages/core/src/utils/utils.service.ts` | DI container |
| `packages/database/src/` | Database layer (Kysely + SQLite) |

## Further Reading

- [Architecture](./architecture.md) — High-level design and agent loop flow
- [Services](./services.md) — DI container patterns
- [Plugins](./plugins.md) — Plugin lifecycle and examples
- [Tools](./tools.md) — Tool definition patterns
- [Databases](./databases.md) — Database definitions and migrations
- [State](./state.md) — Per-plugin conversation state
- [Testing](./testing.md) — Test patterns and MSW usage
- [Coding Standard](./coding-standard.md) — Full coding conventions
