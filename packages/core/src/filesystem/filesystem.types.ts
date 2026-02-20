type EntryMetadata = {
  path: string;
  type: 'file' | 'directory';
  mimeType?: string;
  size?: number;
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

export type { EntryMetadata, FileSystemProvider };
