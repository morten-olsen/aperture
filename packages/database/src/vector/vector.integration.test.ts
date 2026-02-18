import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { Services } from '@morten-olsen/agentic-core';

import { createDatabase } from '../database/database.js';
import { DatabaseService } from '../database/database.service.js';

import { serializeVector, deserializeVector, vectorDistance } from './vector.js';

const vectorTestDatabase = createDatabase({
  id: 'vector-test',
  schema: {
    vector_test_items: z.object({
      id: z.string(),
      label: z.string(),
      embedding: z.instanceof(Buffer),
    }),
  },
  migrations: {
    '2026-02-18-init': {
      up: async (db) => {
        await db.schema
          .createTable('vector_test_items')
          .addColumn('id', 'varchar(255)', (cb) => cb.primaryKey())
          .addColumn('label', 'varchar(255)')
          .addColumn('embedding', 'blob')
          .execute();
      },
    },
  },
});

describe('vector database integration', () => {
  let services: Services;

  beforeEach(async () => {
    services = Services.mock();
    const dbService = services.get(DatabaseService);
    await dbService.get(vectorTestDatabase);
  });

  it('stores and retrieves a serialized vector via blob column', async () => {
    const dbService = services.get(DatabaseService);
    const db = await dbService.get(vectorTestDatabase);

    const vector = [0.1, 0.2, 0.3];
    await db
      .insertInto('vector_test_items')
      .values({ id: '1', label: 'test', embedding: serializeVector(vector) })
      .execute();

    const row = await db
      .selectFrom('vector_test_items')
      .select(['id', 'embedding'])
      .where('id', '=', '1')
      .executeTakeFirstOrThrow();

    const restored = deserializeVector(row.embedding);
    expect(restored).toHaveLength(3);
    expect(restored[0]).toBeCloseTo(0.1, 5);
    expect(restored[1]).toBeCloseTo(0.2, 5);
    expect(restored[2]).toBeCloseTo(0.3, 5);
  });

  it('computes cosine distance via sqlite-vec and orders results', async () => {
    const dbService = services.get(DatabaseService);
    const db = await dbService.get(vectorTestDatabase);

    // Insert three vectors: one close to the query, one far, one in between
    const close = [1.0, 0.0, 0.0];
    const mid = [0.7, 0.7, 0.0];
    const far = [0.0, 0.0, 1.0];

    await db
      .insertInto('vector_test_items')
      .values([
        { id: 'close', label: 'close', embedding: serializeVector(close) },
        { id: 'mid', label: 'mid', embedding: serializeVector(mid) },
        { id: 'far', label: 'far', embedding: serializeVector(far) },
      ])
      .execute();

    const query = [1.0, 0.0, 0.0];
    const results = await db
      .selectFrom('vector_test_items')
      .select(['id', 'label'])
      .select(vectorDistance('embedding', query, 'cosine').as('distance'))
      .orderBy('distance')
      .execute();

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('close');
    expect(results[1].id).toBe('mid');
    expect(results[2].id).toBe('far');

    // Identical vector should have distance 0
    expect(results[0].distance).toBeCloseTo(0, 5);
    // Orthogonal vector should have distance 1
    expect(results[2].distance).toBeCloseTo(1, 5);
  });

  it('computes L2 distance via sqlite-vec', async () => {
    const dbService = services.get(DatabaseService);
    const db = await dbService.get(vectorTestDatabase);

    await db
      .insertInto('vector_test_items')
      .values([
        { id: 'a', label: 'origin', embedding: serializeVector([0.0, 0.0, 0.0]) },
        { id: 'b', label: 'unit', embedding: serializeVector([1.0, 0.0, 0.0]) },
      ])
      .execute();

    const query = [0.0, 0.0, 0.0];
    const results = await db
      .selectFrom('vector_test_items')
      .select(['id'])
      .select(vectorDistance('embedding', query, 'l2').as('distance'))
      .orderBy('distance')
      .execute();

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a');
    expect(results[0].distance).toBeCloseTo(0, 5);
    expect(results[1].id).toBe('b');
    expect(results[1].distance).toBeCloseTo(1, 5);
  });

  it('filters results using vectorDistance in a where clause', async () => {
    const dbService = services.get(DatabaseService);
    const db = await dbService.get(vectorTestDatabase);

    await db
      .insertInto('vector_test_items')
      .values([
        { id: 'near', label: 'near', embedding: serializeVector([1.0, 0.0, 0.0]) },
        { id: 'far', label: 'far', embedding: serializeVector([0.0, 0.0, 1.0]) },
      ])
      .execute();

    const query = [1.0, 0.0, 0.0];
    const results = await db
      .selectFrom('vector_test_items')
      .select(['id'])
      .where(vectorDistance('embedding', query, 'cosine'), '<', 0.5)
      .execute();

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('near');
  });
});
