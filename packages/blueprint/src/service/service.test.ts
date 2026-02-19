import { describe, it, expect, beforeEach } from 'vitest';
import { Services, PluginService } from '@morten-olsen/agentic-core';
import { EmbeddingService } from '@morten-olsen/agentic-database';

import { createBlueprintPlugin } from '../plugin/plugin.js';

import { BlueprintService } from './service.js';

describe('BlueprintService', () => {
  let services: Services;
  let service: BlueprintService;

  const mockEmbedding = (vectors: number[][]) => {
    let callIndex = 0;
    services.set(EmbeddingService, {
      dimensions: 3,
      embed: async (texts: string[]) => {
        const result = texts.map(() => vectors[callIndex++ % vectors.length]);
        return result;
      },
    });
  };

  beforeEach(async () => {
    services = Services.mock();

    mockEmbedding([[0.1, 0.2, 0.3]]);

    const pluginService = services.get(PluginService);
    await pluginService.register(createBlueprintPlugin());

    service = services.get(BlueprintService);
  });

  describe('create', () => {
    it('creates a blueprint and returns it without embedding', async () => {
      const result = await service.create({
        title: 'Deploy Process',
        use_case: 'When deploying to production',
        process: '1. Run tests\n2. Build\n3. Deploy',
      });

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Deploy Process');
      expect(result.use_case).toBe('When deploying to production');
      expect(result.process).toBe('1. Run tests\n2. Build\n3. Deploy');
      expect(result.notes).toBeNull();
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('stores optional notes', async () => {
      const result = await service.create({
        title: 'Test',
        use_case: 'Testing',
        process: 'Run tests',
        notes: 'Remember to check coverage',
      });

      expect(result.notes).toBe('Remember to check coverage');
    });
  });

  describe('get', () => {
    it('returns a blueprint by ID', async () => {
      const created = await service.create({
        title: 'Get Test',
        use_case: 'Testing get',
        process: 'Steps here',
      });

      const fetched = await service.get(created.id);
      expect(fetched?.title).toBe('Get Test');
    });

    it('returns undefined for unknown ID', async () => {
      const result = await service.get('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all blueprints ordered by updated_at desc', async () => {
      const first = await service.create({ title: 'First', use_case: 'A', process: 'Steps' });
      await service.create({ title: 'Second', use_case: 'B', process: 'Steps' });

      // Ensure "First" has an older updated_at by touching "Second" only
      await service.update(first.id, { notes: 'bump' });

      const list = await service.list();
      expect(list).toHaveLength(2);
      // "First" was updated most recently, so it comes first
      expect(list[0].title).toBe('First');
      expect(list[1].title).toBe('Second');
    });

    it('returns only id, title, use_case', async () => {
      await service.create({ title: 'Check', use_case: 'Fields', process: 'Steps' });

      const list = await service.list();
      expect(Object.keys(list[0]).sort()).toEqual(['id', 'title', 'use_case'].sort());
    });
  });

  describe('update', () => {
    it('updates a single field', async () => {
      const created = await service.create({
        title: 'Original',
        use_case: 'Testing',
        process: 'Old steps',
      });

      const updated = await service.update(created.id, { process: 'New steps' });
      expect(updated.process).toBe('New steps');
      expect(updated.title).toBe('Original');
    });

    it('throws for unknown ID', async () => {
      await expect(service.update('nonexistent', { title: 'Nope' })).rejects.toThrow('not found');
    });

    it('updates updated_at timestamp', async () => {
      const created = await service.create({
        title: 'Timestamps',
        use_case: 'Testing',
        process: 'Steps',
      });

      // Wait a tick so the timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await service.update(created.id, { notes: 'Added note' });
      expect(updated.updated_at).not.toBe(created.created_at);
    });
  });

  describe('delete', () => {
    it('removes a blueprint', async () => {
      const created = await service.create({
        title: 'To Delete',
        use_case: 'Testing',
        process: 'Steps',
      });

      await service.delete(created.id);
      const result = await service.get(created.id);
      expect(result).toBeUndefined();
    });
  });

  describe('search', () => {
    it('returns matching blueprints ordered by distance', async () => {
      const close = [1.0, 0.0, 0.0];
      const far = [0.0, 0.0, 1.0];
      const query = [1.0, 0.0, 0.0];

      let callCount = 0;
      services.set(EmbeddingService, {
        dimensions: 3,
        embed: async (texts: string[]) => {
          callCount++;
          if (callCount <= 1) return texts.map(() => close);
          if (callCount <= 2) return texts.map(() => far);
          return texts.map(() => query);
        },
      });

      await service.create({ title: 'Close Match', use_case: 'Near query', process: 'Steps' });
      await service.create({ title: 'Far Match', use_case: 'Distant query', process: 'Steps' });

      const results = await service.search('test query', { maxDistance: 2 });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('Close Match');
    });

    it('filters by maxDistance', async () => {
      services.set(EmbeddingService, {
        dimensions: 3,
        embed: async () => [[0.0, 0.0, 1.0]],
      });

      await service.create({ title: 'Far Away', use_case: 'Very different', process: 'Steps' });

      services.set(EmbeddingService, {
        dimensions: 3,
        embed: async () => [[1.0, 0.0, 0.0]],
      });

      const results = await service.search('test', { maxDistance: 0.1 });
      expect(results).toHaveLength(0);
    });

    it('respects the limit option', async () => {
      services.set(EmbeddingService, {
        dimensions: 3,
        embed: async () => [[1.0, 0.0, 0.0]],
      });

      await service.create({ title: 'A', use_case: 'Test', process: 'Steps' });
      await service.create({ title: 'B', use_case: 'Test', process: 'Steps' });
      await service.create({ title: 'C', use_case: 'Test', process: 'Steps' });

      const results = await service.search('test', { limit: 2, maxDistance: 2 });
      expect(results).toHaveLength(2);
    });
  });
});
