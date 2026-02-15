# Specs

Specs are design documents that describe significant features or architectural decisions before and during implementation.

## Location

All specs live in the `specs/` directory at the repository root.

## Naming Convention

```
NNN-feature-name.md
```

- `NNN` — Zero-padded sequential number (001, 002, ...)
- `feature-name` — Kebab-case short name

## Structure Template

```markdown
# NNN: Feature Name

**Status**: Draft | Approved | Implemented | Superseded by NNN

## Overview
What this feature does and why it exists.

## Scope
What's included and what's explicitly out of scope.

## Data Model
Database tables, schemas, types.

## API / Service Layer
Public methods and their contracts.

## Tool Definitions
Agent tools provided by this feature.

## Plugin Behavior
How the plugin integrates with the agent loop.

## Error Handling
Failure modes and recovery strategies.

## Configuration
Options and defaults.

## Boundary
What this package owns vs. what other packages handle.
```

## Lifecycle

1. **Draft** — Initial proposal, open for discussion
2. **Approved** — Accepted design, ready for implementation
3. **Implemented** — Code matches the spec
4. **Superseded** — Replaced by a newer spec (link to successor)

Keep specs updated as implementation reveals necessary changes. A spec that diverges from the code is worse than no spec.
