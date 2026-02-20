import type { EntryMetadata, FileSystemProvider } from './filesystem.types.js';

type StoredEntry = {
  data: Buffer;
  metadata: EntryMetadata;
};

class FileSystemProviderMemory implements FileSystemProvider {
  #store = new Map<string, StoredEntry>();

  #key = (userId: string, path: string): string => `${userId}:${path}`;

  #normalizePath = (path: string): string => {
    const parts = path.split('/').filter(Boolean);
    return parts.join('/');
  };

  #ensureParentDirs = (userId: string, filePath: string) => {
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      const key = this.#key(userId, dirPath);
      if (!this.#store.has(key)) {
        this.#store.set(key, {
          data: Buffer.alloc(0),
          metadata: { path: dirPath, type: 'directory' },
        });
      }
    }
  };

  public write = async (userId: string, path: string, data: Buffer, mimeType?: string): Promise<void> => {
    const normalized = this.#normalizePath(path);
    this.#ensureParentDirs(userId, normalized);
    this.#store.set(this.#key(userId, normalized), {
      data,
      metadata: {
        path: normalized,
        type: 'file',
        mimeType,
        size: data.byteLength,
      },
    });
  };

  public read = async (
    userId: string,
    path: string,
  ): Promise<{ data: Buffer; metadata: EntryMetadata } | undefined> => {
    const entry = this.#store.get(this.#key(userId, this.#normalizePath(path)));
    if (!entry || entry.metadata.type !== 'file') return undefined;
    return { data: entry.data, metadata: entry.metadata };
  };

  public list = async (userId: string, path: string): Promise<EntryMetadata[]> => {
    const normalized = this.#normalizePath(path);
    const prefix = normalized ? `${normalized}/` : '';
    const results: EntryMetadata[] = [];

    for (const [key, entry] of this.#store) {
      if (!key.startsWith(`${userId}:`)) continue;
      const entryPath = key.slice(userId.length + 1);
      if (!entryPath.startsWith(prefix)) continue;
      const remaining = entryPath.slice(prefix.length);
      if (remaining && !remaining.includes('/')) {
        results.push(entry.metadata);
      }
    }

    return results;
  };

  public glob = async (userId: string, pattern: string, cwd?: string): Promise<EntryMetadata[]> => {
    const { default: picomatch } = await import('picomatch');
    const base = cwd ? this.#normalizePath(cwd) : '';
    const isMatch = picomatch(pattern);
    const results: EntryMetadata[] = [];

    for (const [key, entry] of this.#store) {
      if (!key.startsWith(`${userId}:`)) continue;
      const entryPath = key.slice(userId.length + 1);
      const relative = base && entryPath.startsWith(`${base}/`) ? entryPath.slice(base.length + 1) : entryPath;
      if (base && !entryPath.startsWith(`${base}/`) && entryPath !== base) continue;
      if (entry.metadata.type === 'file' && isMatch(relative)) {
        results.push(entry.metadata);
      }
    }

    return results;
  };

  public remove = async (userId: string, path: string): Promise<void> => {
    const normalized = this.#normalizePath(path);
    const key = this.#key(userId, normalized);
    const prefix = `${userId}:${normalized}/`;

    // Remove the entry itself and any children
    const keysToDelete: string[] = [];
    for (const k of this.#store.keys()) {
      if (k === key || k.startsWith(prefix)) {
        keysToDelete.push(k);
      }
    }
    for (const k of keysToDelete) {
      this.#store.delete(k);
    }
  };

  public exists = async (userId: string, path: string): Promise<boolean> => {
    return this.#store.has(this.#key(userId, this.#normalizePath(path)));
  };

  public stat = async (userId: string, path: string): Promise<EntryMetadata | undefined> => {
    const entry = this.#store.get(this.#key(userId, this.#normalizePath(path)));
    return entry?.metadata;
  };
}

export { FileSystemProviderMemory };
