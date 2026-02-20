import { readFile, writeFile, mkdir, readdir, rm, stat, access } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';

import type { EntryMetadata, FileSystemProvider } from './filesystem.types.js';

class FileSystemProviderDisk implements FileSystemProvider {
  #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  #resolve = (userId: string, path: string): string => {
    const normalized = path.split('/').filter(Boolean).join('/');
    return join(this.#root, userId, normalized);
  };

  #metaPath = (filePath: string): string => `${filePath}.meta.json`;

  #readMeta = async (filePath: string, entryPath: string): Promise<EntryMetadata> => {
    try {
      const raw = await readFile(this.#metaPath(filePath), 'utf-8');
      return JSON.parse(raw) as EntryMetadata;
    } catch {
      return { path: entryPath, type: 'file' };
    }
  };

  #writeMeta = async (filePath: string, metadata: EntryMetadata): Promise<void> => {
    await writeFile(this.#metaPath(filePath), JSON.stringify(metadata));
  };

  #toEntryPath = (userId: string, absolutePath: string): string => {
    return relative(join(this.#root, userId), absolutePath);
  };

  public write = async (userId: string, path: string, data: Buffer, mimeType?: string): Promise<void> => {
    const resolved = this.#resolve(userId, path);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, data);
    const entryPath = path.split('/').filter(Boolean).join('/');
    await this.#writeMeta(resolved, {
      path: entryPath,
      type: 'file',
      mimeType,
      size: data.byteLength,
    });
  };

  public read = async (
    userId: string,
    path: string,
  ): Promise<{ data: Buffer; metadata: EntryMetadata } | undefined> => {
    const resolved = this.#resolve(userId, path);
    try {
      const data = await readFile(resolved);
      const entryPath = path.split('/').filter(Boolean).join('/');
      const metadata = await this.#readMeta(resolved, entryPath);
      return { data, metadata };
    } catch {
      return undefined;
    }
  };

  public list = async (userId: string, path: string): Promise<EntryMetadata[]> => {
    const resolved = this.#resolve(userId, path);
    try {
      const entries = await readdir(resolved, { withFileTypes: true });
      const results: EntryMetadata[] = [];
      for (const entry of entries) {
        if (entry.name.endsWith('.meta.json')) continue;
        const entryPath = this.#toEntryPath(userId, join(resolved, entry.name));
        if (entry.isDirectory()) {
          results.push({ path: entryPath, type: 'directory' });
        } else {
          const meta = await this.#readMeta(join(resolved, entry.name), entryPath);
          results.push(meta);
        }
      }
      return results;
    } catch {
      return [];
    }
  };

  public glob = async (userId: string, pattern: string, cwd?: string): Promise<EntryMetadata[]> => {
    const { default: picomatch } = await import('picomatch');
    const isMatch = picomatch(pattern);
    const basePath = cwd ? this.#resolve(userId, cwd) : join(this.#root, userId);
    const results: EntryMetadata[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.endsWith('.meta.json')) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          const rel = relative(basePath, fullPath);
          if (isMatch(rel)) {
            const entryPath = this.#toEntryPath(userId, fullPath);
            const meta = await this.#readMeta(fullPath, entryPath);
            results.push(meta);
          }
        }
      }
    };

    await walk(basePath);
    return results;
  };

  public remove = async (userId: string, path: string): Promise<void> => {
    const resolved = this.#resolve(userId, path);
    try {
      await rm(resolved, { recursive: true });
    } catch {
      // Already gone
    }
    try {
      await rm(this.#metaPath(resolved));
    } catch {
      // No sidecar
    }
  };

  public exists = async (userId: string, path: string): Promise<boolean> => {
    try {
      await access(this.#resolve(userId, path));
      return true;
    } catch {
      return false;
    }
  };

  public stat = async (userId: string, path: string): Promise<EntryMetadata | undefined> => {
    const resolved = this.#resolve(userId, path);
    try {
      const s = await stat(resolved);
      const entryPath = path.split('/').filter(Boolean).join('/');
      if (s.isDirectory()) {
        return { path: entryPath, type: 'directory' };
      }
      return this.#readMeta(resolved, entryPath);
    } catch {
      return undefined;
    }
  };
}

export { FileSystemProviderDisk };
