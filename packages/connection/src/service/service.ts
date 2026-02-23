import type { Secret, Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { connectionsDatabase } from '../database/database.js';

import type { Connection, ConnectionTypeDefinition } from './service.types.js';

class ConnectionService {
  #services: Services;
  #types: Map<string, ConnectionTypeDefinition>;

  constructor(services: Services) {
    this.#services = services;
    this.#types = new Map();
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(connectionsDatabase);
  };

  public registerType = (definition: ConnectionTypeDefinition) => {
    this.#types.set(definition.id, definition);
  };

  public listTypes = () => {
    return [...this.#types.values()];
  };

  public getType = (id: string) => {
    return this.#types.get(id);
  };

  #resolveSecretFieldsByName = async (
    userId: string,
    fields: Record<string, unknown>,
    secretFieldNames: string[],
  ): Promise<Record<string, unknown>> => {
    const resolved = { ...fields };
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let secrets: Secret[] | null = null;

    for (const field of secretFieldNames) {
      const value = resolved[field];
      if (typeof value !== 'string' || uuidPattern.test(value)) continue;

      if (!secrets) {
        secrets = await this.#services.secrets.list(userId);
      }
      const match = secrets.find((s) => s.name === value);
      if (!match) {
        throw new Error(
          `Secret not found by name: "${value}". Available secrets: ${secrets.map((s) => s.name).join(', ')}`,
        );
      }
      resolved[field] = match.id;
    }

    return resolved;
  };

  public create = async (
    userId: string,
    input: { type: string; name: string; fields: Record<string, unknown> },
  ): Promise<Connection> => {
    const typeDef = this.#types.get(input.type);
    if (!typeDef) {
      throw new Error(`Unknown connection type: ${input.type}`);
    }
    input = {
      ...input,
      fields: await this.#resolveSecretFieldsByName(userId, input.fields, typeDef.fields.secretFields),
    };
    typeDef.fields.schema.parse(input.fields);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const db = await this.#getDb();

    await db
      .insertInto('connections_connections')
      .values({
        id,
        user_id: userId,
        type: input.type,
        name: input.name,
        fields: JSON.stringify(input.fields),
        created_at: now,
        updated_at: now,
      })
      .execute();

    return { id, userId, type: input.type, name: input.name, fields: input.fields, createdAt: now, updatedAt: now };
  };

  public get = async (userId: string, id: string): Promise<Connection | undefined> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('connections_connections')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      name: row.name,
      fields: JSON.parse(row.fields) as Record<string, unknown>,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  public list = async (userId: string, type?: string): Promise<Connection[]> => {
    const db = await this.#getDb();
    let query = db.selectFrom('connections_connections').selectAll().where('user_id', '=', userId);

    if (type) {
      query = query.where('type', '=', type);
    }

    const rows = await query.execute();
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      name: row.name,
      fields: JSON.parse(row.fields) as Record<string, unknown>,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  };

  public update = async (
    userId: string,
    id: string,
    changes: { name?: string; fields?: Record<string, unknown> },
  ): Promise<Connection | undefined> => {
    const db = await this.#getDb();
    const existing = await this.get(userId, id);
    if (!existing) return undefined;

    if (changes.fields) {
      const typeDef = this.#types.get(existing.type);
      if (typeDef) {
        changes = {
          ...changes,
          fields: await this.#resolveSecretFieldsByName(userId, changes.fields, typeDef.fields.secretFields),
        };
        typeDef.fields.schema.parse(changes.fields);
      }
    }

    const updates: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (changes.name !== undefined) updates.name = changes.name;
    if (changes.fields !== undefined) updates.fields = JSON.stringify(changes.fields);

    await db
      .updateTable('connections_connections')
      .set(updates)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();

    return this.get(userId, id);
  };

  public delete = async (userId: string, id: string): Promise<boolean> => {
    const db = await this.#getDb();
    const result = await db
      .deleteFrom('connections_connections')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();
    return result.length > 0 && Number(result[0].numDeletedRows) > 0;
  };

  public resolve = async (userId: string, id: string): Promise<Record<string, unknown> | undefined> => {
    const connection = await this.get(userId, id);
    if (!connection) return undefined;

    const typeDef = this.#types.get(connection.type);
    if (!typeDef) return connection.fields;

    const resolved = { ...connection.fields };
    for (const secretField of typeDef.fields.secretFields) {
      const secretId = resolved[secretField];
      if (typeof secretId === 'string') {
        const value = await this.#services.secrets.get(userId, secretId);
        if (value !== undefined) {
          resolved[secretField] = value;
        }
      }
    }
    return resolved;
  };

  public findBySecretId = async (userId: string, secretId: string): Promise<Connection[]> => {
    const allConnections = await this.list(userId);
    return allConnections.filter((connection) => {
      const typeDef = this.#types.get(connection.type);
      if (!typeDef) return false;
      return typeDef.fields.secretFields.some((field) => connection.fields[field] === secretId);
    });
  };
}

export { ConnectionService };
