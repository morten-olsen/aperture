# Web Fetch Plugin

The web fetch plugin lets agents retrieve and read web pages. Content can be returned as raw HTML, converted to Markdown (via Turndown), or as a list of extracted links. A database-backed domain allowlist controls which hosts the agent may fetch, managed entirely through agent tools at runtime.

## Registration

```typescript
import { createWebFetchPlugin } from '@morten-olsen/agentic-web-fetch';

// Default settings
await pluginService.register(createWebFetchPlugin());

// Custom settings
await pluginService.register(
  createWebFetchPlugin({
    maxCharacters: 30_000,
    defaultMode: 'markdown',
    userAgent: 'MyBot/1.0',
  }),
);
```

### Options

| Option          | Type                               | Default             | Description                             |
|-----------------|-------------------------------------|---------------------|-----------------------------------------|
| `maxCharacters` | `number`                            | `50000`             | Max characters returned per fetch       |
| `defaultMode`   | `'html' \| 'markdown' \| 'links'`  | `'markdown'`        | Default content mode when not specified  |
| `userAgent`     | `string`                            | `'GLaDOS-Agent/1.0'`| User-Agent header sent with requests    |

## Available Tools

### `web-fetch.fetch`

Fetch a URL and return its content in the requested mode.

```typescript
// Input
{
  url: "https://example.com/docs",
  mode: "markdown",        // optional, defaults to plugin's defaultMode
  maxCharacters: 10000     // optional, overrides plugin default
}

// Output
{
  url: "https://example.com/docs",
  domain: "example.com",
  mode: "markdown",
  content: "# Page Title\n\nSome content...",
  truncated: false,
  contentLength: 1234
}
```

**Modes:**

- **`html`** — raw HTML response body
- **`markdown`** — HTML converted to Markdown via Turndown
- **`links`** — JSON array of `{ text, href }` objects extracted from `<a>` tags, with relative URLs resolved

### `web-fetch.add-domain`

Add a domain to the allowlist. Domains are normalized to lowercase.

```typescript
// Input
{ domain: "example.com" }

// Output
{ domain: "example.com", added: true }   // false if already present
```

### `web-fetch.remove-domain`

Remove a domain from the allowlist.

```typescript
// Input
{ domain: "example.com" }

// Output
{ domain: "example.com", removed: true }  // false if not found
```

### `web-fetch.list-domains`

List all allowed domains (sorted alphabetically).

```typescript
// Input: (none)

// Output
{ domains: ["docs.example.com", "example.com"] }
```

## Domain Allowlist

The agent must explicitly add domains before fetching. This prevents accidental requests to sensitive internal services. Domains are stored in a database table and persist across sessions.

Workflow:
1. Agent receives a request to fetch a URL
2. Agent checks the allowlist (or calls `web-fetch.list-domains`)
3. If the domain isn't allowed, agent calls `web-fetch.add-domain` first
4. Agent calls `web-fetch.fetch` to retrieve content

## Database

Database ID: `web_fetch`

### `web_fetch_allowed_domains`

| Column       | Type         | Notes                   |
|--------------|--------------|-------------------------|
| `domain`     | varchar(255) | PK — lowercase hostname |
| `created_at` | varchar(255) | ISO 8601 timestamp      |

## Server Configuration

Enabled by default. Configure via environment variables or config file:

| Environment Variable       | Default             | Description                        |
|---------------------------|---------------------|------------------------------------|
| `WEB_FETCH_ENABLED`       | `true`              | Enable/disable the plugin          |
| `WEB_FETCH_MAX_CHARACTERS`| `50000`             | Max characters per fetch           |
| `WEB_FETCH_DEFAULT_MODE`  | `'markdown'`        | Default fetch mode                 |
| `WEB_FETCH_USER_AGENT`    | `'GLaDOS-Agent/1.0'`| User-Agent header                  |

## Dependencies

- `@morten-olsen/agentic-core` — plugin, tool, and services types
- `@morten-olsen/agentic-database` — database creation and DatabaseService
- `turndown` — HTML to Markdown conversion
- `zod` — schema validation
