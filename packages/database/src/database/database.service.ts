import SQLite from 'better-sqlite3';
import { Kysely, Migrator, SqliteDialect, type MigrationProvider } from 'kysely';
import type { z, ZodType } from 'zod';
import type { Services } from '@morten-olsen/agentic-core';

import { DatabaseConfig } from '../config/config.js';

import type { Database } from './database.types.js';

class DatabaseService {
  #services: Services;
  #db?: Promise<Kysely<unknown>>;
  #instances: Record<string, Promise<Kysely<unknown>>>;

  constructor(services: Services) {
    this.#services = services;
    this.#instances = {};
  }

  #setupDb = async () => {
    const config = this.#services.get(DatabaseConfig);
    const dialect = new SqliteDialect({
      database: new SQLite(config.location),
    });

    const db = new Kysely<unknown>({
      dialect,
    });

    return db;
  };

  #getDb = async () => {
    if (!this.#db) {
      this.#db = this.#setupDb();
    }
    return await this.#db;
  };

  #prepareInstance = async (database: Database) => {
    const db = await this.#getDb();
    const provider: MigrationProvider = {
      getMigrations: async () => database.migrations,
    };
    const migrator = new Migrator({
      db,
      provider,
      migrationTableName: `_migrations_${database.id}`,
    });
    const { error } = await migrator.migrateToLatest();
    if (error) {
      console.error(`Migration failed for ${database.id}`, error);
      throw error; // Prevent plugin from starting
    }
    return db;
  };

  public get = async <TSchema extends Record<string, ZodType> = Record<string, ZodType>>(
    database: Database<TSchema>,
  ) => {
    if (!this.#instances[database.id]) {
      this.#instances[database.id] = this.#prepareInstance(database);
    }
    return (await this.#instances[database.id]) as Kysely<{
      [TTable in keyof TSchema]: z.infer<TSchema[TTable]>;
    }>;
  };
}

export { DatabaseService };
