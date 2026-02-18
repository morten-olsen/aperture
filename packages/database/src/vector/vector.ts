import { type RawBuilder, sql } from 'kysely';

const serializeVector = (vector: number[]): Buffer => {
  return Buffer.from(new Float32Array(vector).buffer);
};

const deserializeVector = (buffer: Buffer): number[] => {
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
};

const vectorDistance = (column: string, vector: number[], metric: 'cosine' | 'l2' = 'cosine'): RawBuilder<number> => {
  const fn = metric === 'cosine' ? 'vec_distance_cosine' : 'vec_distance_L2';
  const blob = serializeVector(vector);
  return sql<number>`${sql.raw(fn)}(${sql.ref(column)}, ${blob})`;
};

export { serializeVector, deserializeVector, vectorDistance };
