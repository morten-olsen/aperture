# Aperture

A self-hosted AI assistant that runs as a single Docker container. Connect it to Telegram, sync your calendars, schedule autonomous tasks — and extend it with plugins when you need more.

Aperture is built around a plugin-driven agent loop. The core runs the LLM conversation cycle; plugins contribute tools, context, and state. It speaks the OpenAI-compatible API, so it works with any provider — OpenAI, OpenRouter, Gemini, local models, or anything else behind an OpenAI-shaped endpoint.

**What it can do out of the box:**

- Chat via **Telegram** — multi-user, per-chat model overrides, Markdown formatting
- Stay aware of your **calendar** — syncs from CalDAV (Nextcloud, iCloud, etc.), injects today's agenda into every conversation
- Run **scheduled tasks** — cron-based triggers that autonomously run agent sessions, with continuation across runs and notification delivery
- **Activate skills on demand** — dynamically enable and disable tool sets mid-conversation

## Running with Docker

```bash
docker run -d \
  -v /path/to/config.json:/etc/glados/config.json:ro \
  -v aperture-data:/data \
  ghcr.io/morten-olsen/aperture:latest
```

Or with Docker Compose:

```yaml
services:
  aperture:
    image: ghcr.io/morten-olsen/aperture:latest
    volumes:
      - ./config.json:/etc/glados/config.json:ro
      - aperture-data:/data

volumes:
  aperture-data:
```

## Configuration

Config is loaded from (in order, later overrides earlier):

1. `/etc/glados/config.json` — system-wide (mount here in Docker)
2. `~/.config/glados/config.json` — user home
3. `./config.json` — working directory

Environment variables override all config files.

### Minimal config

Currently, Telegram is the only user-facing interface, so a minimal setup requires both an LLM provider and a Telegram bot token. Create a bot via [@BotFather](https://t.me/BotFather) and grab your chat ID from [@userinfobot](https://t.me/userinfobot).

```json
{
  "openai": {
    "apiKey": "sk-...",
    "baseUrl": "https://openrouter.ai/api/v1"
  },
  "model": {
    "normal": "google/gemini-3-flash-preview"
  },
  "telegram": {
    "enabled": true,
    "token": "123456:ABC-DEF...",
    "users": [
      { "chatId": "your-chat-id", "userId": "your-name" }
    ]
  }
}
```

### Key environment variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key for the OpenAI-compatible provider |
| `OPENAI_BASE_URL` | Provider base URL |
| `MODEL_NORMAL` | Default model for prompts |
| `TELEGRAM_ENABLED` | Enable Telegram (`true` / `false`) |
| `TELEGRAM_TOKEN` | Telegram bot token |
| `TELEGRAM_USERS` | JSON array of `[{ "chatId": "...", "userId": "..." }]` |
| `DATABASE_LOCATION` | Path to the SQLite database (default: `/data/db.sqlite`) |

See [docs/deployment.md](docs/deployment.md) for the full configuration reference, including Calendar and Trigger settings.

## Included Plugins

| Plugin | Description | Enabled by default |
|--------|-------------|--------------------|
| [Database](docs/plugins/database/) | Typed SQLite storage via Kysely | Always |
| [Conversation](docs/plugins/conversation/) | Multi-turn conversation management and history | Always |
| [Trigger](docs/plugins/trigger/) | Scheduled and event-driven tasks (cron) | Yes |
| [Skill](docs/plugins/skill/) | Dynamic skill activation/deactivation | Yes |
| [Calendar](docs/plugins/calendar/) | CalDAV calendar sync with agenda injection | No |
| [Telegram](docs/plugins/telegram/) | Telegram bot interface | No |

## Persistent State

All data lives in a single SQLite file. In Docker, this is at `/data/db.sqlite` inside the volume. Back it up by copying the file — WAL mode makes it safe to copy while running.

```bash
docker cp <container>:/data/db.sqlite ./backup.sqlite
```

## Developing Plugins

Aperture is designed to be extended. Plugins can contribute tools, inject system context, manage per-conversation state, and define their own databases.

### Quick example

```typescript
import { createPlugin, createTool } from '@morten-olsen/agentic-core';
import { z } from 'zod';

const greetTool = createTool({
  id: 'greeter.greet',
  name: 'Greet',
  description: 'Greet someone by name',
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  invoke: async ({ input }) => ({
    message: `Hello, ${input.name}!`,
  }),
});

const greeterPlugin = createPlugin({
  id: 'greeter',
  name: 'Greeter',
  description: 'A simple greeting plugin',
  state: z.unknown(),
  prepare: async ({ tools }) => {
    tools.push(greetTool);
  },
});

export { greeterPlugin };
```

### Plugin documentation

- [Writing plugins](docs/plugins.md) — Lifecycle hooks, context, state, and full examples
- [Defining tools](docs/tools.md) — Typed tool creation with Zod schemas
- [Databases](docs/databases.md) — Per-plugin typed SQLite with migrations
- [State](docs/state.md) — Per-plugin, per-conversation storage

## Development Setup

Requires **Node.js** (LTS) and **pnpm** 10.6.0+ (`corepack enable`).

```bash
pnpm install
pnpm build
pnpm test
```

See [docs/developer-guide.md](docs/developer-guide.md) for the full workflow, and [docs/coding-standard.md](docs/coding-standard.md) for coding conventions.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | High-level design, package structure, agent loop |
| [Developer Guide](docs/developer-guide.md) | Setup, workflow, package conventions |
| [Deployment](docs/deployment.md) | Docker, configuration, environment variables |
| [Plugins](docs/plugins.md) | Writing and registering plugins |
| [Tools](docs/tools.md) | Tool definitions and patterns |
| [Databases](docs/databases.md) | Database layer and migrations |
| [State](docs/state.md) | Per-plugin conversation state |
| [Services](docs/services.md) | Dependency injection container |
| [Testing](docs/testing.md) | Test infrastructure and conventions |
| [Coding Standard](docs/coding-standard.md) | TypeScript coding rules |
| [Specs](docs/specs.md) | Design document process |

## License

[AGPL-3.0](LICENSE)
