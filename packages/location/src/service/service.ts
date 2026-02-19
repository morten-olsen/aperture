import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';

class LocationService {
  #services: Services;

  constructor(services: Services) {
    this.#services = services;
  }

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    return databaseService.get(database);
  };

  updateLocation = async (userId: string, latitude: number, longitude: number) => {
    const db = await this.#getDb();
    const capturedAt = new Date().toISOString();
    await db
      .insertInto('location_entries')
      .values({
        user_id: userId,
        latitude,
        longitude,
        captured_at: capturedAt,
      })
      .execute();
  };

  getLatest = async (userId: string) => {
    const db = await this.#getDb();
    return db
      .selectFrom('location_entries')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('captured_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  };
}

export { LocationService };
