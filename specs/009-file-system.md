# 009: File System

**Status**: Draft

## Overview

Introduce a per-user virtual file system that tools and plugins can use to produce and consume files (images, documents, generated artifacts, etc.). Files flow through a `FileSystemProvider` abstraction so deployments can swap between in-memory, disk, or cloud storage without changing plugin code.

A new `file` prompt output type lets the agent surface files to the user. Integrations (Telegram, future web UI) inspect these outputs after a prompt completes and deliver the files through their respective channels.

## Scope

### Included

- `FileSystemProvider` interface and in-memory default in `core`
- `FileSystemProviderDisk` disk-backed implementation in `core` with per-user subdirectories
- `FileSystemService` in `core` — thin wrapper providing per-user namespacing on top of the provider
- Provider injected via `Config` (mirrors `SecretsProvider` pattern)
- Exposed to plugins in `setup()` and `prepare()`, and to tools in `invoke()`
- New `file` prompt output type and `promptsToMessages` handling
- `filesystem` plugin with agent-facing tools (read, write, list, remove)
- Server package: uses `FileSystemProviderDisk` by default, configurable via `FILES_LOCATION` env var
- Dockerfile: `/data/files` volume directory for persistent file storage
- Telegram integration: send file outputs as documents on prompt completion

### Out of scope

- Access control beyond user isolation
- Streaming / chunked uploads
- Quota / size limits (can be added later)
- File sharing between users

## Data Model

### FileSystemProvider (core)

```typescript
type EntryMetadata = {
  /** Full path relative to user root, using forward slashes (e.g. "docs/report.pdf") */
  path: string;
  type: 'file' | 'directory';
  mimeType?: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

type FileSystemProvider = {
  write: (userId: string, path: string, data: Buffer, mimeType?: string) => Promise<void>;
  read: (userId: string, path: string) => Promise<{ data: Buffer; metadata: EntryMetadata } | undefined>;
  list: (userId: string, path: string) => Promise<EntryMetadata[]>;
  glob: (userId: string, pattern: string, cwd?: string) => Promise<EntryMetadata[]>;
  remove: (userId: string, path: string) => Promise<void>;
  exists: (userId: string, path: string) => Promise<boolean>;
  stat: (userId: string, path: string) => Promise<EntryMetadata | undefined>;
};
```

Paths are forward-slash separated, relative to the user root (e.g. `docs/report.pdf`). Leading slashes are stripped. The provider is responsible for per-user isolation — two users with the same path must not collide.

Path traversal (`..`) is rejected by the provider. All path components are validated before any I/O.

### In-memory default

```typescript
class FileSystemProviderMemory implements FileSystemProvider {
  // Internal store: Map<`${userId}:${path}`, { data: Buffer; metadata: EntryMetadata }>
  // Directories are tracked as entries with type: 'directory' and empty data
}
```

Mirrors `SecretsProviderMemory` — zero-config default for tests and development.

`list` returns immediate children of the given directory path. `glob` matches against all entries using [picomatch](https://github.com/micromatch/picomatch)-style patterns (e.g. `**/*.pdf`, `docs/*.md`) with an optional `cwd` to scope the search. `write` implicitly creates parent directories.

### Disk provider

```typescript
class FileSystemProviderDisk implements FileSystemProvider {
  #baseDir: string;

  constructor(baseDir: string);
}
```

On-disk layout maps directly to the filesystem with a per-user root directory:

```
<baseDir>/
  <userId>/
    report.pdf
    report.pdf.meta.json
    docs/
      notes.md
      notes.md.meta.json
      images/
        chart.png
        chart.png.meta.json
  <otherUserId>/
    ...
```

Metadata (`mimeType`, `createdAt`, `updatedAt`) is stored in a sidecar JSON file next to each data file (`<name>.meta.json`). This avoids needing a database while keeping the provider self-contained.

`write` creates parent directories lazily via `fs.mkdir({ recursive: true })`. `list` maps to `fs.readdir` on the resolved directory. `glob` uses [picomatch](https://github.com/micromatch/picomatch) to match against a recursive directory walk, scoped to `cwd` when provided. Paths are validated — `..` components are rejected with an error.

### Config extension

```typescript
type Config = z.input<typeof configSchema> & {
  secrets?: SecretsProvider;
  fileSystem?: FileSystemProvider;
};
```

### Services extension

`Services` gains a `public get fileSystem(): FileSystemProvider` getter, defaulting to `FileSystemProviderMemory` when `config.fileSystem` is not provided (same pattern as `secrets`).

## API / Service Layer

### FileSystemService (core)

A service class registered in the DI container. Wraps `FileSystemProvider` and takes care of per-user scoping so callers don't have to thread `userId` manually when they already have it from context.

```typescript
class FileSystemService {
  constructor(services: Services);

  /** Write a file. Creates parent directories implicitly. */
  write(userId: string, path: string, data: Buffer, mimeType?: string): Promise<void>;

  /** Read a file. Returns undefined if not found. */
  read(userId: string, path: string): Promise<{ data: Buffer; metadata: EntryMetadata } | undefined>;

  /** List immediate children of a directory. */
  list(userId: string, path: string): Promise<EntryMetadata[]>;

  /** Find entries matching a glob pattern (e.g. "**/*.pdf", "docs/*.md"). */
  glob(userId: string, pattern: string, cwd?: string): Promise<EntryMetadata[]>;

  /** Remove a file or directory (recursive). */
  remove(userId: string, path: string): Promise<void>;

  /** Check existence. */
  exists(userId: string, path: string): Promise<boolean>;

  /** Get metadata for a single entry. */
  stat(userId: string, path: string): Promise<EntryMetadata | undefined>;
}
```

The service delegates directly to the provider. Having it as a service means plugins and tools access it through the standard `services.get(FileSystemService)` pattern and it can be mocked in tests via `services.set(FileSystemService, partial)`.

## Prompt Output: `file` Type

### Schema

```typescript
const promptOutputFileSchema = promptOutputBase.extend({
  type: z.literal('file'),
  path: z.string(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

type PromptOutputFile = z.input<typeof promptOutputFileSchema>;
```

Added to the `promptOutputSchema` discriminated union alongside `text` and `tool`.

The actual file data lives in the `FileSystemProvider` — the output record only references it by path. This keeps prompt state lightweight and serialisable.

### promptsToMessages

When converting a `file` output to model messages, render it as an assistant message so the model knows the user has been shown the file:

```typescript
if (output.type === 'file') {
  messages.push({
    role: 'assistant',
    content: `[File sent to user: "${output.path}"${output.description ? ` — ${output.description}` : ''}]`,
  });
}
```

This gives the model awareness that the file was delivered without including the binary data in the context.

## Tool Definitions

All tools live in the `filesystem` plugin and are namespaced `filesystem.*`.

### filesystem.write

Write or overwrite a file. Creates parent directories implicitly.

| Field | Schema |
|-------|--------|
| input | `{ path: string, content: string, encoding?: 'utf-8' \| 'base64', mimeType?: string }` |
| output | `{ path: string, size: number }` |

`content` is a string; `encoding` defaults to `utf-8`. For binary data the model uses `base64`.

### filesystem.read

Read a file's content.

| Field | Schema |
|-------|--------|
| input | `{ path: string, encoding?: 'utf-8' \| 'base64' }` |
| output | `{ path: string, content: string, mimeType?: string, size: number }` |

Returns content as a string in the requested encoding.

### filesystem.list

List immediate children of a directory.

| Field | Schema |
|-------|--------|
| input | `{ path?: string }` |
| output | `{ entries: EntryMetadata[] }` |

`path` defaults to `""` (user root). Returns both files and subdirectories with their `type` field distinguishing them.

### filesystem.glob

Find files matching a glob pattern.

| Field | Schema |
|-------|--------|
| input | `{ pattern: string, cwd?: string }` |
| output | `{ entries: EntryMetadata[] }` |

Uses picomatch-style patterns. Examples: `**/*.pdf`, `docs/**/*.md`, `*.txt`. `cwd` scopes the search to a subdirectory (defaults to user root).

### filesystem.remove

Delete a file or directory (recursive).

| Field | Schema |
|-------|--------|
| input | `{ path: string }` |
| output | `{ removed: boolean }` |

### filesystem.output

Send a file to the user. This is the primary way tools/the agent make files visible — it appends a `file` prompt output.

| Field | Schema |
|-------|--------|
| input | `{ path: string, description?: string }` |
| output | `{ sent: boolean }` |

The tool verifies the file exists, reads its metadata, and pushes a `PromptOutputFile` onto the current prompt's output array. Integration layers (Telegram, etc.) pick it up on completion.

## Plugin Behavior

### filesystem plugin

```typescript
const filesystemPlugin = createPlugin({
  id: 'filesystem',
  config: z.unknown(),
  state: z.unknown(),
  prepare: async ({ tools }) => {
    tools.push(writeFile, readFile, listDir, globFiles, removeFile, outputFile);
  },
});
```

No `setup()` needed — the `FileSystemService` is lazy-initialised via the DI container on first use.

### Integration with existing plugins

Plugins and tools that need file access use `services.get(FileSystemService)` in their `invoke` / `prepare` / `setup` callbacks. They already receive `services` and `userId`, so the pattern is:

```typescript
invoke: async ({ input, userId, services }) => {
  const fs = services.get(FileSystemService);
  await fs.write(userId, 'reports/quarterly.pdf', pdfBuffer, 'application/pdf');
};
```

## Telegram Integration

In the telegram plugin's `completed` handler, after sending text parts, iterate over `file` outputs and send each as a document:

```typescript
completion.on('completed', async () => {
  // ... existing text handling ...

  const fileOutputs = completion.prompt.output.filter((o) => o.type === 'file');
  if (fileOutputs.length > 0) {
    const fs = services.get(FileSystemService);
    for (const fileOutput of fileOutputs) {
      const file = await fs.read(completion.userId, fileOutput.path);
      if (!file) continue;

      // Use the basename for the document filename
      const fileName = fileOutput.path.split('/').pop() || fileOutput.path;
      await botService.sendDocument(chatId, {
        data: file.data,
        name: fileName,
        mimeType: file.metadata.mimeType,
        caption: fileOutput.description,
      });
    }
  }
});
```

This requires adding a `sendDocument` method to `TelegramBotService`:

```typescript
public sendDocument = async (
  chatId: string,
  file: { data: Buffer; name: string; mimeType?: string; caption?: string },
): Promise<void> => {
  await this.bot.api.sendDocument({
    chat_id: chatId,
    document: { filename: file.name, file: file.data },
    caption: file.caption,
  });
};
```

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| `filesystem.read` on missing file | Return error result (tool error propagated to model) |
| `filesystem.list` on missing directory | Return error result (tool error propagated to model) |
| `filesystem.glob` with no matches | Return `{ entries: [] }` (empty, not an error) |
| `filesystem.output` on missing file | Return `{ sent: false }` with descriptive error |
| Path traversal (`..` in path) | Provider rejects with error before any I/O |
| `FileSystemProvider.write` fails | Error propagates through tool invoke; model sees error result |
| `filesystem.remove` on directory | Recursively removes directory and all contents |
| Telegram `sendDocument` fails | Log error, skip file (same pattern as existing `sendMessage` error handling) |
| File too large for Telegram (50 MB) | Telegram API returns error; caught and logged |

## Configuration

| Option | Location | Default |
|--------|----------|---------|
| `fileSystem` | `Config` | `FileSystemProviderMemory` (in-memory) |

No plugin-level config for `filesystem` — it uses `z.unknown()`. Deployments configure the provider at the `Config` level when constructing `Services`.

### Server package

The server config gains a `files.location` option:

```typescript
files: {
  location: {
    doc: 'Directory for per-user file storage',
    format: String,
    default: './files',
    env: 'FILES_LOCATION',
  },
},
```

In `startServer`, the disk provider is created and passed to `Services`:

```typescript
import { FileSystemProviderDisk } from '@morten-olsen/agentic-core';

const services = new Services({
  provider: { ... },
  models: { ... },
  fileSystem: new FileSystemProviderDisk(config.files.location),
});
```

### Dockerfile

Add a `/data/files` directory alongside the existing `/data` volume:

```dockerfile
RUN mkdir -p /data/files && chown glados:glados /data /data/files
VOLUME /data
ENV DATABASE_LOCATION=/data/db.sqlite
ENV FILES_LOCATION=/data/files
```

The `mkdir -p` ensures the directory tree is created recursively. Both `DATABASE_LOCATION` and `FILES_LOCATION` point inside the `/data` volume so all persistent state is captured by a single volume mount.

## Boundary

### Core owns

- `FileSystemProvider` type, `FileSystemProviderMemory`, and `FileSystemProviderDisk`
- `FileSystemService` (DI-registered, per-user delegation)
- `PromptOutputFile` schema and `promptsToMessages` rendering
- Export from `core/src/exports.ts`

### Filesystem plugin owns

- Agent-facing tools (`filesystem.*`)
- Tool implementations that bridge between model requests and `FileSystemService`

### Telegram owns

- Sending file outputs as documents
- `TelegramBotService.sendDocument`

### Server owns

- `files.location` config key and `FILES_LOCATION` env var
- Wiring `FileSystemProviderDisk` into `Services`
- Dockerfile volume setup for `/data/files`

### Not owned by this feature

- Cloud storage backends (S3, GCS) — can be provided externally via `Config.fileSystem`
- File format conversion or processing
- Virus scanning or content validation
