# Plugins

All functionality beyond the core agent loop is provided by plugins. Each plugin is a separate package under `packages/` with the `@morten-olsen/agentic-*` scope.

## Plugin Index

| Plugin | Package | Description |
|--------|---------|-------------|
| [Artifact](./artifact/) | `agentic-artifact` | Stores and retrieves large structured data produced by tools |
| [Blueprint](./blueprint/) | `agentic-blueprint` | Reusable behavioral patterns with embedding-based semantic search |
| [Calendar](./calendar/) | `agentic-calendar` | CalDAV calendar sync with recurring event expansion and agenda injection |
| [Conversation](./conversation/) | `agentic-conversation` | Multi-turn conversation history, persistence, and state management |
| [Daily Note](./daily-note/) | `agentic-daily-note` | Per-day memory system with automatic today-note context injection |
| [Database](./database/) | `agentic-database` | Type-safe SQLite with per-plugin migration tracking (foundation layer) |
| [Filesystem](./filesystem/) | `agentic-filesystem` | Virtual per-user file system for producing, consuming, and delivering files |
| [Home Assistant](./home-assistant/) | `agentic-home-assistant` | WebSocket integration with Home Assistant for entity tracking |
| [Interpreter](./interpreter/) | `agentic-interpreter` | Sandboxed JavaScript execution via QuickJS |
| [Location](./location/) | `agentic-location` | User location tracking with automatic context injection |
| [Notification](./notification/) | `agentic-notification` | Event-based notification delivery system |
| [Personality](./personality/) | `agentic-personality` | Per-user personality/tone configuration injected into every prompt |
| [Shell](./shell/) | `agentic-shell` | Shell command execution with per-user allow/deny rules |
| [SSH](./ssh/) | `agentic-ssh` | Remote command execution via SSH with per-user hosts, rules, and key pairs |
| [Skill](./skill/) | `agentic-skill` | Dynamic capability bundles activated/deactivated per conversation |
| [Telegram](./telegram/) | `agentic-telegram` | Telegram bot interface via Gramio with MarkdownV2 formatting |
| [Time](./time/) | `agentic-time` | Injects current local time and timezone into prompt context |
| [Todo](./todo/) | `agentic-todo` | Task management with subtasks, priorities, projects, tags, and due dates |
| [Trigger](./trigger/) | `agentic-trigger` | Scheduled agent invocations (cron and one-time) |
| [Usage](./usage/) | `agentic-usage` | Token usage and cost tracking across models and time ranges |
| [Weather](./weather/) | `agentic-weather` | Current weather conditions via Open-Meteo API |
| [Web Fetch](./web-fetch/) | `agentic-web-fetch` | Fetch and read web pages with domain allowlist |

## Plugin Types

**Context-only** — inject information into prompts without providing tools:
- Time, Location

**Tool providers** — give the agent new capabilities:
- Artifact, Blueprint, Calendar, Daily Note, Filesystem, Interpreter, Personality, Skill, Todo, Trigger, Usage, Weather, Web Fetch

**Skill-based** — register as skills activated per conversation (depend on the Skill plugin):
- Shell, SSH

**Integration bridges** — connect to external systems:
- Home Assistant, Telegram

**Infrastructure** — foundational services used by other plugins:
- Conversation, Database, Notification
