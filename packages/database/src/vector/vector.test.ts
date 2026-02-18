import { describe, it, expect } from 'vitest';

import { serializeVector, deserializeVector, vectorDistance } from './vector.js';

describe('serializeVector / deserializeVector', () => {
  it('roundtrips a vector', () => {
    const vector = [0.1, 0.2, 0.3, -0.5, 1.0];
    const buffer = serializeVector(vector);
    const result = deserializeVector(buffer);

    expect(result).toHaveLength(vector.length);
    for (let i = 0; i < vector.length; i++) {
      expect(result[i]).toBeCloseTo(vector[i] as number, 5);
    }
  });

  it('produces a buffer of correct byte length', () => {
    const vector = [1.0, 2.0, 3.0];
    const buffer = serializeVector(vector);
    // Float32 = 4 bytes per element
    expect(buffer.byteLength).toBe(vector.length * 4);
  });

  it('handles empty vector', () => {
    const buffer = serializeVector([]);
    const result = deserializeVector(buffer);
    expect(result).toEqual([]);
  });
});

describe('vectorDistance', () => {
  it('produces a Kysely sql fragment for cosine distance', () => {
    const fragment = vectorDistance('embedding', [0.1, 0.2, 0.3]);
    const compiled = fragment.toOperationNode();
    expect(compiled).toBeDefined();
  });

  it('produces a Kysely sql fragment for L2 distance', () => {
    const fragment = vectorDistance('embedding', [0.1, 0.2, 0.3], 'l2');
    const compiled = fragment.toOperationNode();
    expect(compiled).toBeDefined();
  });

  it('defaults to cosine distance', () => {
    const cosineFragment = vectorDistance('col', [1.0]);
    const explicitCosine = vectorDistance('col', [1.0], 'cosine');
    // Both should produce equivalent operation nodes
    expect(cosineFragment.toOperationNode()).toEqual(explicitCosine.toOperationNode());
  });
});
