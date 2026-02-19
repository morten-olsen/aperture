import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService, EmbeddingService, serializeVector, vectorDistance } from '@morten-olsen/agentic-database';

import type { Blueprint, BlueprintPluginOptions } from '../schemas/schemas.js';
import { database } from '../database/database.js';

type BlueprintServiceOptions = Required<BlueprintPluginOptions>;

class BlueprintService {
  #services: Services;
  #options: BlueprintServiceOptions;

  constructor(services: Services) {
    this.#services = services;
    this.#options = {
      topN: 5,
      maxDistance: 0.7,
    };
  }

  configure = (options: BlueprintPluginOptions) => {
    this.#options = {
      topN: options.topN ?? 5,
      maxDistance: options.maxDistance ?? 0.7,
    };
  };

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(database);
  };

  #generateEmbedding = async (title: string, useCase: string): Promise<Buffer> => {
    const embeddingService = this.#services.get(EmbeddingService);
    const text = `${title} — ${useCase}`;
    const [vector] = await embeddingService.embed([text]);
    return serializeVector(vector);
  };

  create = async (input: { title: string; use_case: string; process: string; notes?: string }): Promise<Blueprint> => {
    const db = await this.#getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const embedding = await this.#generateEmbedding(input.title, input.use_case);

    const record = {
      id,
      title: input.title,
      use_case: input.use_case,
      process: input.process,
      notes: input.notes ?? null,
      embedding,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto('blueprint_blueprints').values(record).execute();

    return {
      id: record.id,
      title: record.title,
      use_case: record.use_case,
      process: record.process,
      notes: record.notes,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  };

  get = async (id: string): Promise<Blueprint | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('blueprint_blueprints')
      .select(['id', 'title', 'use_case', 'process', 'notes', 'created_at', 'updated_at'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ?? undefined;
  };

  list = async (): Promise<{ id: string; title: string; use_case: string }[]> => {
    const db = await this.#getDb();
    return db
      .selectFrom('blueprint_blueprints')
      .select(['id', 'title', 'use_case'])
      .orderBy('updated_at', 'desc')
      .execute();
  };

  update = async (
    id: string,
    changes: {
      title?: string;
      use_case?: string;
      process?: string;
      notes?: string;
    },
  ): Promise<Blueprint> => {
    const db = await this.#getDb();
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Blueprint "${id}" not found`);
    }

    const now = new Date().toISOString();
    const newTitle = changes.title ?? existing.title;
    const newUseCase = changes.use_case ?? existing.use_case;

    const needsReEmbed = changes.title !== undefined || changes.use_case !== undefined;
    const embedding = needsReEmbed ? await this.#generateEmbedding(newTitle, newUseCase) : undefined;

    const updateValues: Record<string, unknown> = { updated_at: now };
    if (changes.title !== undefined) updateValues.title = changes.title;
    if (changes.use_case !== undefined) updateValues.use_case = changes.use_case;
    if (changes.process !== undefined) updateValues.process = changes.process;
    if (changes.notes !== undefined) updateValues.notes = changes.notes;
    if (embedding !== undefined) updateValues.embedding = embedding;

    await db.updateTable('blueprint_blueprints').set(updateValues).where('id', '=', id).execute();

    const updated = await this.get(id);
    if (!updated) {
      throw new Error(`Blueprint "${id}" not found after update`);
    }
    return updated;
  };

  delete = async (id: string): Promise<void> => {
    const db = await this.#getDb();
    await db.deleteFrom('blueprint_blueprints').where('id', '=', id).execute();
  };

  search = async (
    query: string,
    options?: { limit?: number; maxDistance?: number },
  ): Promise<{ id: string; title: string; distance: number }[]> => {
    const limit = options?.limit ?? this.#options.topN;
    const maxDistance = options?.maxDistance ?? this.#options.maxDistance;

    const embeddingService = this.#services.get(EmbeddingService);
    const [queryVector] = await embeddingService.embed([query]);

    const db = await this.#getDb();
    const results = await db
      .selectFrom('blueprint_blueprints')
      .select(['id', 'title'])
      .select(vectorDistance('embedding', queryVector).as('distance'))
      .where(vectorDistance('embedding', queryVector), '<', maxDistance)
      .orderBy('distance')
      .limit(limit)
      .execute();

    return results;
  };
}

export { BlueprintService };
