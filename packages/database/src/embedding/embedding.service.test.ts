import { describe, it, expect, beforeEach } from 'vitest';
import { Services } from '@morten-olsen/agentic-core';

import { EmbeddingConfig } from './embedding.config.js';
import { EmbeddingService } from './embedding.service.js';

describe('EmbeddingService', () => {
  let services: Services;

  beforeEach(() => {
    services = Services.mock();
  });

  it('exposes dimensions from config', () => {
    const config = services.get(EmbeddingConfig);
    config.dimensions = 768;

    const embeddingService = services.get(EmbeddingService);
    expect(embeddingService.dimensions).toBe(768);
  });

  it('delegates embed calls to a mock provider', async () => {
    const mockVectors = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];

    services.set(EmbeddingService, {
      dimensions: 3,
      embed: async (texts: string[]) => mockVectors.slice(0, texts.length),
    });

    const replaced = services.get(EmbeddingService);
    const result = await replaced.embed(['hello', 'world']);
    expect(result).toEqual(mockVectors);
  });

  it('returns dimensions matching config after changes', () => {
    const config = services.get(EmbeddingConfig);
    config.dimensions = 1536;

    const embeddingService = services.get(EmbeddingService);
    expect(embeddingService.dimensions).toBe(1536);

    config.dimensions = 256;
    expect(embeddingService.dimensions).toBe(256);
  });
});
