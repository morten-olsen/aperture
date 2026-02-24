import crypto from 'node:crypto';

import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';
import type { Artifact } from '../schemas/schemas.js';

type AddArtifactOptions = {
  type: string;
  description?: string;
  data: unknown;
};

class ArtifactService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(database);
  };

  public add = async (options: AddArtifactOptions): Promise<string> => {
    const db = await this.#getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .insertInto('artifact_artifacts')
      .values({
        id,
        type: options.type,
        description: options.description ?? null,
        data: JSON.stringify(options.data),
        created_at: now,
      })
      .execute();

    return id;
  };

  public list = async (): Promise<{ id: string; type: string; description: string | null; createdAt: string }[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('artifact_artifacts')
      .select(['id', 'type', 'description', 'created_at'])
      .execute();
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      description: row.description,
      createdAt: row.created_at,
    }));
  };

  public get = async (id: string): Promise<Artifact | undefined> => {
    const db = await this.#getDb();
    const row = await db.selectFrom('artifact_artifacts').selectAll().where('id', '=', id).executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      type: row.type,
      description: row.description ?? undefined,
      data: JSON.parse(row.data),
      createdAt: row.created_at,
    };
  };
}

export { ArtifactService };
export type { AddArtifactOptions };
