# Deployment

The server package (`@morten-olsen/agentic-server`) is the production entry point. It's published as a Docker image at `ghcr.io/morten-olsen/aperture` and runs the agent with configurable plugins.

## Quick Start

```bash
docker run -d \
  -v /path/to/config.json:/etc/glados/config.json:ro \
  -v glados-data:/data \
  ghcr.io/morten-olsen/aperture:latest
```

Or with `docker-compose.yml`:

```yaml
services:
  glados:
    image: ghcr.io/morten-olsen/aperture:latest
    volumes:
      - ./config.json:/etc/glados/config.json:ro
      - glados-data:/data

volumes:
  glados-data:
```

## Configuration

The server loads config files from these paths (in order, later files override earlier ones):

1. `/etc/glados/config.json` — system-wide (mount your config here in Docker)
2. `~/.config/glados/config.json` — user home
3. `./config.json` — working directory

Every config value can also be set via environment variables. **Env vars take precedence over config files.**

### Example Config

```json
{
  "openai": {
    "apiKey": "sk-...",
    "baseUrl": "https://openrouter.ai/api/v1"
  },
  "model": {
    "normal": "google/gemini-3-flash-preview",
    "high": ""
  },
  "telegram": {
    "enabled": false,
    "token": "",
    "users": [
      { "chatId": "12345678", "userId": "user" }
    ]
  },
  "calendar": {
    "enabled": false,
    "defaultSyncIntervalMinutes": 30,
    "injectTodayAgenda": true,
    "expansionWindow": { "pastMonths": 1, "futureMonths": 3 }
  },
  "trigger": {
    "enabled": true
  },
  "blueprint": {
    "enabled": true,
    "topN": 5,
    "maxDistance": 0.7
  }
}
```

### Environment Variables

#### OpenAI Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `""` | API key for OpenAI-compatible provider |
| `OPENAI_BASE_URL` | `""` | Base URL (e.g., `https://openrouter.ai/api/v1`) |

#### Models

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_NORMAL` | `google/gemini-3-flash-preview` | Default model for normal-tier prompts |
| `MODEL_HIGH` | `""` | Model for high-tier prompts. Falls back to `MODEL_NORMAL` if empty. |

#### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_LOCATION` | `/data/db.sqlite` (Docker) | Path to the SQLite database file |

#### Embeddings

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDINGS_PROVIDER` | `openai` | Embedding provider: `openai` (hosted API) or `local` (HuggingFace) |
| `EMBEDDINGS_MODEL` | `openai/text-embedding-3-small` | Embedding model identifier |
| `EMBEDDINGS_DIMENSIONS` | `1536` | Vector dimensions (must match the model's output) |

#### Telegram

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_ENABLED` | `false` | Enable the Telegram plugin |
| `TELEGRAM_TOKEN` | `""` | Telegram bot token |
| `TELEGRAM_USERS` | `[]` | JSON array of `{ "chatId": "...", "userId": "..." }` objects |

#### Calendar

| Variable | Default | Description |
|----------|---------|-------------|
| `CALENDAR_ENABLED` | `false` | Enable the calendar plugin |
| `CALENDAR_SYNC_INTERVAL` | `30` | Default sync interval in minutes |
| `CALENDAR_INJECT_TODAY_AGENDA` | `true` | Add today's events to prompt context |
| `CALENDAR_EXPANSION_PAST_MONTHS` | `1` | RRULE expansion window (past) |
| `CALENDAR_EXPANSION_FUTURE_MONTHS` | `3` | RRULE expansion window (future) |

#### Blueprint

| Variable | Default | Description |
|----------|---------|-------------|
| `BLUEPRINT_ENABLED` | `true` | Enable the behavioural blueprints plugin |
| `BLUEPRINT_TOP_N` | `5` | Maximum blueprints to surface in context per turn |
| `BLUEPRINT_MAX_DISTANCE` | `0.7` | Cosine distance threshold for suggestions (lower = stricter) |

#### Trigger

| Variable | Default | Description |
|----------|---------|-------------|
| `TRIGGER_ENABLED` | `true` | Enable the trigger/scheduler plugin |

## Plugins

The server always registers the **database** and **conversation** plugins. The remaining plugins are conditional:

| Plugin | Config key | Default |
|--------|-----------|---------|
| Blueprint | `blueprint.enabled` | `true` |
| Trigger | `trigger.enabled` | `true` |
| Calendar | `calendar.enabled` | `false` |
| Telegram | `telegram.enabled` | `false` |

## Persistent State

All persistent state lives in a single SQLite database. In Docker, this is stored at `/data/db.sqlite` inside the `/data` volume.

**What's stored:**
- Conversation history and prompt logs (`conversation_*`, `db_prompts` tables)
- Trigger definitions and invocation records (`triggers_*` tables)
- Calendar events and notes (`calendar_*` tables — re-synced when stale)
- Telegram chat metadata (`telegram_chats` table)
- Behavioural blueprints (`blueprint_blueprints` table)

**Backup:** Copy the SQLite file from the Docker volume. The database uses WAL mode so it's safe to copy while the container is running.

```bash
docker cp <container>:/data/db.sqlite ./backup.sqlite
```

## Docker Image Details

The image uses a multi-stage build:

1. **Pruner** — uses Turbo to extract only the server package and its workspace dependencies
2. **Builder** — installs dependencies, compiles TypeScript, prunes dev dependencies
3. **Runner** — minimal `node:24-slim` image, runs as non-root user `glados` (uid 1001)

The entry point is `node packages/server/dist/server/server.start.js`.

### Image Tags

Pushed to `ghcr.io/morten-olsen/aperture` on every merge to `main`:

| Tag | Example | Description |
|-----|---------|-------------|
| `latest` | `latest` | Most recent main build |
| `v{major}.{minor}.{patch}` | `v1.2.3` | Full semantic version |
| `{major}.{minor}` | `1.2` | Major.minor (tracks patches) |
| `{major}` | `1` | Major version (tracks minor + patches) |
| `sha-{hash}` | `sha-abc1234` | Specific commit |

Versions are auto-incremented from conventional commit messages via the CI pipeline.

## Building Locally

```bash
docker build -t glados .
docker run -d \
  -v ./config.json:/etc/glados/config.json:ro \
  -v glados-data:/data \
  glados
```
