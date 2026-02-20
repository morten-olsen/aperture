import type { Services } from '../utils/utils.service.js';

import type { EntryMetadata, FileSystemProvider } from './filesystem.types.js';

class FileSystemService {
  #provider: FileSystemProvider;

  constructor(services: Services) {
    this.#provider = services.fileSystem;
  }

  public write = (userId: string, path: string, data: Buffer, mimeType?: string): Promise<void> =>
    this.#provider.write(userId, path, data, mimeType);

  public read = (userId: string, path: string): Promise<{ data: Buffer; metadata: EntryMetadata } | undefined> =>
    this.#provider.read(userId, path);

  public list = (userId: string, path: string): Promise<EntryMetadata[]> => this.#provider.list(userId, path);

  public glob = (userId: string, pattern: string, cwd?: string): Promise<EntryMetadata[]> =>
    this.#provider.glob(userId, pattern, cwd);

  public remove = (userId: string, path: string): Promise<void> => this.#provider.remove(userId, path);

  public exists = (userId: string, path: string): Promise<boolean> => this.#provider.exists(userId, path);

  public stat = (userId: string, path: string): Promise<EntryMetadata | undefined> => this.#provider.stat(userId, path);
}

export { FileSystemService };
