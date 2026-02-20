import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, assert } from 'vitest';

import { FileSystemProviderDisk } from './filesystem.disk.js';

describe('FileSystemProviderDisk', () => {
  let provider: FileSystemProviderDisk;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fs-disk-test-'));
    provider = new FileSystemProviderDisk(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true });
  });

  describe('write and read', () => {
    it('writes and reads a file', async () => {
      await provider.write('user1', 'hello.txt', Buffer.from('Hello!'), 'text/plain');
      const result = await provider.read('user1', 'hello.txt');
      assert(result);
      expect(result.data.toString()).toBe('Hello!');
      expect(result.metadata.mimeType).toBe('text/plain');
      expect(result.metadata.size).toBe(6);
    });

    it('returns undefined for non-existent file', async () => {
      const result = await provider.read('user1', 'missing.txt');
      expect(result).toBeUndefined();
    });

    it('creates parent directories implicitly', async () => {
      await provider.write('user1', 'a/b/c.txt', Buffer.from('nested'));
      const result = await provider.read('user1', 'a/b/c.txt');
      assert(result);
      expect(result.data.toString()).toBe('nested');
    });

    it('isolates data between users', async () => {
      await provider.write('user1', 'f.txt', Buffer.from('u1'));
      await provider.write('user2', 'f.txt', Buffer.from('u2'));
      const r1 = await provider.read('user1', 'f.txt');
      const r2 = await provider.read('user2', 'f.txt');
      assert(r1);
      assert(r2);
      expect(r1.data.toString()).toBe('u1');
      expect(r2.data.toString()).toBe('u2');
    });
  });

  describe('list', () => {
    it('lists direct children', async () => {
      await provider.write('user1', 'docs/a.txt', Buffer.from('a'));
      await provider.write('user1', 'docs/b.txt', Buffer.from('b'));
      await provider.write('user1', 'docs/sub/c.txt', Buffer.from('c'));
      const entries = await provider.list('user1', 'docs');
      const names = entries.map((e) => e.path).sort();
      expect(names).toEqual(['docs/a.txt', 'docs/b.txt', 'docs/sub']);
    });

    it('returns empty for missing directory', async () => {
      const entries = await provider.list('user1', 'nope');
      expect(entries).toEqual([]);
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
      await provider.write('user1', 'temp.txt', Buffer.from(''));
      await provider.remove('user1', 'temp.txt');
      expect(await provider.exists('user1', 'temp.txt')).toBe(false);
    });

    it('removes a directory recursively', async () => {
      await provider.write('user1', 'dir/a.txt', Buffer.from(''));
      await provider.write('user1', 'dir/sub/b.txt', Buffer.from(''));
      await provider.remove('user1', 'dir');
      expect(await provider.exists('user1', 'dir')).toBe(false);
    });

    it('does not throw for non-existent path', async () => {
      await expect(provider.remove('user1', 'nope')).resolves.toBeUndefined();
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
