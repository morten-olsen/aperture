import type { Secret, SecretsProvider, SecretUpdate, Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { secretsDatabase } from '../database/database.js';

class SecretsProviderDatabase implements SecretsProvider {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(secretsDatabase);
  };

  public list = async (userId: string): Promise<Secret[]> => {
    const db = await this.#getDb();
    const rows = await db
      .selectFrom('secrets_values')
      .select(['id', 'user_id', 'name', 'description', 'created_at', 'updated_at'])
      .where('user_id', '=', userId)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  };

  public set = async (userId: string, secret: Secret, value: string): Promise<void> => {
    const db = await this.#getDb();
    await db
      .insertInto('secrets_values')
      .values({
        id: secret.id,
        user_id: userId,
        name: secret.name,
        description: secret.description ?? null,
        value,
        created_at: secret.createdAt,
        updated_at: secret.updatedAt,
      })
      .execute();
  };

  public get = async (userId: string, id: string): Promise<string | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('secrets_values')
      .select(['value'])
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row?.value;
  };

  public update = async (userId: string, id: string, changes: SecretUpdate): Promise<void> => {
    const db = await this.#getDb();
    const updates: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (changes.name !== undefined) updates.name = changes.name;
    if (changes.description !== undefined) updates.description = changes.description;
    if (changes.value !== undefined) updates.value = changes.value;

    await db.updateTable('secrets_values').set(updates).where('id', '=', id).where('user_id', '=', userId).execute();
  };

  public remove = async (userId: string, id: string): Promise<void> => {
    const db = await this.#getDb();
    await db.deleteFrom('secrets_values').where('id', '=', id).where('user_id', '=', userId).execute();
  };
}

export { SecretsProviderDatabase };
