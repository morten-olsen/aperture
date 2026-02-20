# Filesystem Plugin

The filesystem plugin provides a virtual per-user file system so agents can produce, consume, and deliver files (images, documents, generated artifacts). Files are isolated per user and can be sent to the user via the `filesystem.output` tool, which creates a `file` prompt output that integrations (e.g. Telegram) can deliver.

## Registration

```typescript
import { filesystemPlugin } from '@morten-olsen/agentic-filesystem';

await pluginService.register(filesystemPlugin, undefined);
```

No configuration options. Plugin ID: `'filesystem'`.

The underlying storage is determined by the `FileSystemProvider` passed to the `Services` constructor. By default an in-memory provider is used. For persistent storage, pass a `FileSystemProviderDisk`:

```typescript
import { FileSystemProviderDisk, Services } from '@morten-olsen/agentic-core';

const services = new Services({
  // ...
  fileSystem: new FileSystemProviderDisk('/data/files'),
});
```

## Available Tools

### `filesystem.write`

Write content to a file. Parent directories are created automatically.

```typescript
// Input
{
  path: "reports/summary.txt",
  content: "Monthly summary...",
  encoding: "utf-8",       // optional, default: "utf-8". Also accepts "base64"
  mimeType: "text/plain"   // optional
}

// Output
{ written: true, path: "reports/summary.txt" }
```

### `filesystem.read`

Read a file and return its content.

```typescript
// Input
{
  path: "reports/summary.txt",
  encoding: "utf-8"   // optional, default: "utf-8". Also accepts "base64"
}

// Output
{
  content: "Monthly summary...",   // null if file not found
  mimeType: "text/plain",
  size: 18
}
```

### `filesystem.list`

List files and directories at a given path.

```typescript
// Input
{ path: "reports" }   // optional, default: root

// Output
{
  entries: [
    { path: "reports/summary.txt", type: "file", mimeType: "text/plain", size: 18 },
    { path: "reports/charts", type: "directory" }
  ]
}
```

### `filesystem.glob`

Find files matching a glob pattern.

```typescript
// Input
{
  pattern: "**/*.txt",
  cwd: "reports"       // optional, default: root
}

// Output
{
  entries: [
    { path: "reports/summary.txt", type: "file", mimeType: "text/plain", size: 18 }
  ]
}
```

### `filesystem.remove`

Remove a file or directory (recursive).

```typescript
// Input
{ path: "reports/summary.txt" }

// Output
{ removed: true, path: "reports/summary.txt" }
```

### `filesystem.output`

Send a file to the user. Verifies the file exists, then creates a `file` prompt output that integrations can deliver (e.g. Telegram sends it as a document).

```typescript
// Input
{
  path: "reports/chart.png",
  description: "Monthly revenue chart"   // optional
}

// Output
{ sent: true, path: "reports/chart.png", mimeType: "image/png" }
```

## Core Abstractions

### FileSystemProvider

The `FileSystemProvider` interface in `@morten-olsen/agentic-core` defines the storage backend:

```typescript
type FileSystemProvider = {
  write(userId: string, path: string, data: Buffer, mimeType?: string): Promise<void>;
  read(userId: string, path: string): Promise<{ data: Buffer; metadata: EntryMetadata } | undefined>;
  list(userId: string, path: string): Promise<EntryMetadata[]>;
  glob(userId: string, pattern: string, cwd?: string): Promise<EntryMetadata[]>;
  remove(userId: string, path: string): Promise<void>;
  exists(userId: string, path: string): Promise<boolean>;
  stat(userId: string, path: string): Promise<EntryMetadata | undefined>;
};
```

Two implementations are provided:

- **`FileSystemProviderMemory`** — Map-backed, suitable for tests and ephemeral use
- **`FileSystemProviderDisk`** — Real filesystem with per-user subdirectories and `.meta.json` sidecar files for metadata

### FileSystemService

DI service (`services.get(FileSystemService)`) that delegates to the configured provider. Used by all filesystem tools and by integrations reading file data.

### Prompt Output: `file`

A new `file` prompt output type allows tools to signal that a file should be delivered to the user:

```typescript
{
  type: 'file',
  path: 'reports/chart.png',
  mimeType: 'image/png',
  description: 'Monthly revenue chart',
  start: '2026-02-20T12:00:00.000Z',
  end: '2026-02-20T12:00:00.000Z'
}
```

In conversation history, file outputs appear as: `[File sent to user: "reports/chart.png" — Monthly revenue chart]`

## Integration: Telegram

When a prompt completes with `file` outputs, the Telegram plugin reads each file via `FileSystemService` and sends it as a document using `sendDocument`.

## Server Configuration

Enabled by default. Configure via environment variables or config file:

| Environment Variable | Default         | Description                         |
|---------------------|-----------------|-------------------------------------|
| `FILES_ENABLED`     | `true`          | Enable/disable the plugin           |
| `FILES_LOCATION`    | `'./data/files'`| Directory for persistent file storage |

In the Docker image, `FILES_LOCATION` defaults to `/data/files`.

## Dependencies

- `@morten-olsen/agentic-core` — plugin, tool, services, and FileSystemService
- `zod` — schema validation
