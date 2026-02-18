# 005: Web Fetch Plugin

**Status**: Draft

## Overview

The `@morten-olsen/agentic-web-fetch` package provides a web content fetching plugin that lets the agent retrieve and read web pages. Content can be returned as raw HTML, converted to Markdown (via Turndown), or as a list of extracted links. A domain allowlist stored in a local database controls which hosts the agent is permitted to fetch, with tools to manage the list at runtime.

## Goals

- **Multiple fetch modes** — return content as `html`, `markdown`, or `links`
- **Markdown conversion** — use [Turndown](https://github.com/mixmark-io/turndown) for clean HTML-to-Markdown
- **Size control** — a configurable `maxCharacters` limit truncates responses before they reach the model
- **Domain allowlist** — only fetch from explicitly permitted domains, stored in a database table
- **Runtime allowlist management** — tools to add and remove domains without restarting

## Non-Goals

- JavaScript rendering / headless browser (fetch only — no SPA support)
- Caching or archival of fetched pages
- POST requests or form submission
- Authentication / cookie management

---

## Configuration

The plugin factory accepts options for default behaviour:

```typescript
type WebFetchPluginOptions = {
  maxCharacters?: number;         // default: 50_000
  defaultMode?: 'html' | 'markdown' | 'links';  // default: 'markdown'
  userAgent?: string;             // custom User-Agent header
};
```

Example:

```typescript
createWebFetchPlugin({
  maxCharacters: 30_000,
  defaultMode: 'markdown',
});
```

---

## Database

Database ID: `web-fetch`

### Tables

#### `web_fetch_allowed_domains`

Stores the domain allowlist.

| Column       | Type         | Notes                        |
|--------------|--------------|------------------------------|
| `domain`     | varchar(255) | PK — lowercase hostname      |
| `created_at` | varchar(255) | ISO 8601 timestamp           |

### Migrations

Single initial migration: `2026-02-18-init`

---

## Service

### `WebFetchService`

Registered in the DI container. Handles the actual fetching and content transformation.

```
class WebFetchService {
  constructor(services: Services)

  // Fetch a URL and return content in the requested mode
  fetch(options: {
    url: string;
    mode: 'html' | 'markdown' | 'links';
    maxCharacters?: number;
  }): Promise<FetchResult>

  // Domain allowlist management
  isAllowed(domain: string): Promise<boolean>
  addDomain(domain: string): Promise<void>
  removeDomain(domain: string): Promise<void>
  listDomains(): Promise<string[]>
}
```

**`FetchResult`**:

```typescript
type FetchResult = {
  url: string;
  domain: string;
  mode: 'html' | 'markdown' | 'links';
  content: string;              // the fetched content (or JSON-stringified link array for 'links' mode)
  truncated: boolean;           // whether maxCharacters was hit
  contentLength: number;        // original content length before truncation
};
```

### Fetching Logic

1. Parse the URL and extract the hostname
2. Check the domain against the allowlist — reject if not allowed
3. Fetch the page using `fetch()` (Node 18+ built-in) with the configured User-Agent
4. Based on mode:
   - **`html`** — return the raw HTML body
   - **`markdown`** — pass HTML through Turndown, return the resulting Markdown
   - **`links`** — parse the HTML, extract all `<a href="...">` elements, return as JSON array of `{ text, href }` objects (resolving relative URLs against the page URL)
5. If the result exceeds `maxCharacters`, truncate and set `truncated: true`

### Error Handling

- Non-2xx responses: throw with status code and status text
- Network errors: let them propagate — the framework reports errors back to the model
- Domain not allowed: throw a descriptive error so the model knows to ask the user or add the domain first

---

## Tools

All tool IDs namespaced under `web-fetch.*`.

### `web-fetch.fetch`

Fetch a URL and return its content.

- **Input**:
  - `url: string` — the URL to fetch
  - `mode?: 'html' | 'markdown' | 'links'` — content mode (default: plugin's `defaultMode`)
  - `maxCharacters?: number` — override the default character limit for this request
- **Output**: `{ url, domain, mode, content, truncated, contentLength }`

### `web-fetch.add-domain`

Add a domain to the allowlist.

- **Input**: `{ domain: string }` — the domain to allow (e.g. `"example.com"`)
- **Output**: `{ domain, added: boolean }` — `added` is `false` if already present

### `web-fetch.remove-domain`

Remove a domain from the allowlist.

- **Input**: `{ domain: string }`
- **Output**: `{ domain, removed: boolean }` — `removed` is `false` if not found

### `web-fetch.list-domains`

List all allowed domains.

- **Input**: (none)
- **Output**: `{ domains: string[] }`

---

## Plugin Lifecycle

### `setup()`

1. Initialize database (runs migrations)

### `prepare()`

1. Push all web-fetch tools to the tool list
2. Add a context item informing the agent about web fetching capabilities and the allowlist constraint:

```
You can fetch web pages using the web-fetch.* tools.
Only domains on the allowlist can be fetched. Use web-fetch.list-domains to see allowed domains, and web-fetch.add-domain to add new ones before fetching.
```

---

## Package Structure

```
packages/web-fetch/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── exports.ts
    ├── plugin/
    │   └── plugin.ts              # createWebFetchPlugin factory
    ├── database/
    │   └── database.ts            # createDatabase with schema + migrations
    ├── service/
    │   └── service.ts             # WebFetchService (DI service)
    ├── tools/
    │   ├── tools.ts               # re-export all tools as array
    │   ├── tools.fetch.ts
    │   ├── tools.add-domain.ts
    │   ├── tools.remove-domain.ts
    │   └── tools.list-domains.ts
    └── schemas/
        └── schemas.ts             # shared Zod schemas (FetchResult, inputs)
```

### Dependencies

- `@morten-olsen/agentic-core` — plugin/tool/services types
- `@morten-olsen/agentic-database` — database creation + DatabaseService
- `turndown` — HTML to Markdown conversion
- `zod` — schema validation

---

## Server Integration

### Config (`packages/server/src/config/config.ts`)

Add a `webFetch` section to the convict schema:

```typescript
webFetch: {
  enabled: {
    doc: 'Enable web fetch plugin',
    format: Boolean,
    default: true,
    env: 'WEB_FETCH_ENABLED',
  },
  maxCharacters: {
    doc: 'Maximum characters returned per fetch',
    format: 'int',
    default: 50000,
    env: 'WEB_FETCH_MAX_CHARACTERS',
  },
  defaultMode: {
    doc: 'Default fetch mode (html, markdown, links)',
    format: String,
    default: 'markdown',
    env: 'WEB_FETCH_DEFAULT_MODE',
  },
  userAgent: {
    doc: 'Custom User-Agent header for web fetches',
    format: String,
    default: 'GLaDOS-Agent/1.0',
    env: 'WEB_FETCH_USER_AGENT',
  },
},
```

### Registration (`packages/server/src/server/server.ts`)

**Enabled by default** — no `enabled` check needed unless explicitly disabled:

```typescript
if (config.webFetch.enabled) {
  plugins.push(
    createWebFetchPlugin({
      maxCharacters: config.webFetch.maxCharacters,
      defaultMode: config.webFetch.defaultMode,
      userAgent: config.webFetch.userAgent,
    }),
  );
}
```

Startup log line:

```typescript
console.log(`[glados]   web-fetch: ${config.webFetch.enabled ? 'enabled' : 'disabled'}`);
```

---

## Design Decisions

1. **Domain allowlist over blocklist** — an allowlist is safer by default. The agent must explicitly add domains before fetching, preventing accidental requests to sensitive internal services or arbitrary sites. Domains are managed exclusively through the agent tools, keeping the allowlist under conversational control rather than static config.

2. **Turndown for Markdown** — Turndown is a well-maintained, configurable HTML-to-Markdown library. It produces clean output and is much lighter than a headless browser. No custom Turndown rules are needed initially — the defaults handle common HTML well.

3. **Character truncation over summarization** — truncation is deterministic and fast. The model can request a smaller `maxCharacters` or use `links` mode to navigate before fetching specific content. Summarization would require an extra model call and add latency/cost.

4. **`links` mode** — lets the agent discover page structure and navigate without consuming a large character budget. Useful for sitemaps, documentation indices, and search result pages.

5. **Enabled by default** — web fetching is a broadly useful capability with the allowlist providing sufficient safety. Unlike Telegram or CalDAV, it requires no external credentials or configuration to function.

6. **No caching** — pages change frequently and caching adds complexity. The agent can re-fetch as needed. Caching can be added later if latency becomes an issue.
