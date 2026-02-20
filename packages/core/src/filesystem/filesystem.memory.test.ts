import { describe, it, expect, beforeEach, assert } from 'vitest';

import { FileSystemProviderMemory } from './filesystem.memory.js';

describe('FileSystemProviderMemory', () => {
  let provider: FileSystemProviderMemory;

  beforeEach(() => {
    provider = new FileSystemProviderMemory();
  });

  describe('write and read', () => {
    it('writes and reads a file', async () => {
      await provider.write('user1', 'hello.txt', Buffer.from('Hello, world!'), 'text/plain');
      const result = await provider.read('user1', 'hello.txt');
      assert(result);
      expect(result.data.toString('utf-8')).toBe('Hello, world!');
      expect(result.metadata.mimeType).toBe('text/plain');
      expect(result.metadata.size).toBe(13);
      expect(result.metadata.type).toBe('file');
    });

    it('returns undefined for non-existent file', async () => {
      const result = await provider.read('user1', 'missing.txt');
      expect(result).toBeUndefined();
    });

    it('isolates data between users', async () => {
      await provider.write('user1', 'data.txt', Buffer.from('user1 data'));
      await provider.write('user2', 'data.txt', Buffer.from('user2 data'));
      const r1 = await provider.read('user1', 'data.txt');
      const r2 = await provider.read('user2', 'data.txt');
      assert(r1);
      assert(r2);
      expect(r1.data.toString()).toBe('user1 data');
      expect(r2.data.toString()).toBe('user2 data');
    });

    it('creates implicit parent directories', async () => {
      await provider.write('user1', 'a/b/c.txt', Buffer.from('nested'));
      const dirStat = await provider.stat('user1', 'a');
      assert(dirStat);
      expect(dirStat.type).toBe('directory');
      const subDirStat = await provider.stat('user1', 'a/b');
      assert(subDirStat);
      expect(subDirStat.type).toBe('directory');
    });

    it('normalizes paths with leading/trailing slashes', async () => {
      await provider.write('user1', '/foo/bar.txt', Buffer.from('ok'));
      const result = await provider.read('user1', 'foo/bar.txt');
      assert(result);
      expect(result.data.toString()).toBe('ok');
    });
  });

  describe('list', () => {
    it('lists direct children of a directory', async () => {
      await provider.write('user1', 'docs/a.txt', Buffer.from('a'));
      await provider.write('user1', 'docs/b.txt', Buffer.from('b'));
      await provider.write('user1', 'docs/sub/c.txt', Buffer.from('c'));
      const entries = await provider.list('user1', 'docs');
      const names = entries.map((e) => e.path).sort();
      expect(names).toEqual(['docs/a.txt', 'docs/b.txt', 'docs/sub']);
    });

    it('lists root entries', async () => {
      await provider.write('user1', 'root.txt', Buffer.from('r'));
      await provider.write('user1', 'folder/inner.txt', Buffer.from('i'));
      const entries = await provider.list('user1', '');
      const names = entries.map((e) => e.path).sort();
      expect(names).toEqual(['folder', 'root.txt']);
    });
  });

  describe('glob', () => {
    it('matches files by pattern', async () => {
      await provider.write('user1', 'src/a.ts', Buffer.from(''));
      await provider.write('user1', 'src/b.js', Buffer.from(''));
      await provider.write('user1', 'src/nested/c.ts', Buffer.from(''));
      const results = await provider.glob('user1', '**/*.ts');
      const paths = results.map((e) => e.path).sort();
      expect(paths).toEqual(['src/a.ts', 'src/nested/c.ts']);
    });

    it('respects cwd parameter', async () => {
      await provider.write('user1', 'src/a.ts', Buffer.from(''));
      await provider.write('user1', 'lib/b.ts', Buffer.from(''));
      const results = await provider.glob('user1', '*.ts', 'src');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('src/a.ts');
    });
  });

  describe('remove', () => {
    it('removes a file', async () => {
      await provider.write('user1', 'temp.txt', Buffer.from('temp'));
      await provider.remove('user1', 'temp.txt');
      expect(await provider.exists('user1', 'temp.txt')).toBe(false);
    });

    it('removes a directory and its children', async () => {
      await provider.write('user1', 'dir/a.txt', Buffer.from(''));
      await provider.write('user1', 'dir/sub/b.txt', Buffer.from(''));
      await provider.remove('user1', 'dir');
      expect(await provider.exists('user1', 'dir')).toBe(false);
      expect(await provider.exists('user1', 'dir/a.txt')).toBe(false);
      expect(await provider.exists('user1', 'dir/sub/b.txt')).toBe(false);
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      await provider.write('user1', 'yes.txt', Buffer.from(''));
      expect(await provider.exists('user1', 'yes.txt')).toBe(true);
    });

    it('returns false for missing file', async () => {
      expect(await provider.exists('user1', 'no.txt')).toBe(false);
    });
  });

  describe('stat', () => {
    it('returns file metadata', async () => {
      await provider.write('user1', 'file.bin', Buffer.from([1, 2, 3]), 'application/octet-stream');
      const meta = await provider.stat('user1', 'file.bin');
      expect(meta).toEqual({
        path: 'file.bin',
        type: 'file',
        mimeType: 'application/octet-stream',
        size: 3,
      });
    });

    it('returns directory metadata', async () => {
      await provider.write('user1', 'mydir/file.txt', Buffer.from(''));
      const meta = await provider.stat('user1', 'mydir');
      assert(meta);
      expect(meta.type).toBe('directory');
    });

    it('returns undefined for missing path', async () => {
      expect(await provider.stat('user1', 'ghost')).toBeUndefined();
    });
  });
});
