import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import { createDAVClient } from 'tsdav';
import { RRule, rrulestr } from 'rrule';
import { database } from '../database/database.js';
import type { CalendarSource, CalendarPluginOptions } from '../schemas/schemas.js';

type SyncTimer = {
  sourceId: string;
  intervalId: NodeJS.Timeout;
};

class CalendarSyncService {
  #services: Services;
  #options: CalendarPluginOptions | null = null;
  #timers: SyncTimer[] = [];
  #lastSyncTimes: Map<string, string> = new Map();

  constructor(services: Services) {
    this.#services = services;
  }

  public initialize(options: CalendarPluginOptions) {
    this.#options = options;
  }

  #getOptions(): CalendarPluginOptions {
    if (!this.#options) {
      throw new Error('CalendarSyncService not initialized');
    }
    return this.#options;
  }

  public async initialSync() {
    const options = this.#getOptions();
    for (const source of options.sources) {
      await this.#syncSource(source);
    }
  }

  public startPeriodicSync() {
    const options = this.#getOptions();
    for (const source of options.sources) {
      const intervalMinutes =
        source.syncIntervalMinutes ??
        options.defaultSyncIntervalMinutes ??
        15;
      const intervalMs = intervalMinutes * 60 * 1000;

      const intervalId = setInterval(() => {
        this.#syncSource(source).catch((error) => {
          console.error(
            `Error syncing calendar ${source.id}:`,
            error
          );
        });
      }, intervalMs);

      this.#timers.push({
        sourceId: source.id,
        intervalId,
      });
    }
  }

  public stopPeriodicSync() {
    for (const timer of this.#timers) {
      clearInterval(timer.intervalId);
    }
    this.#timers = [];
  }

  public getLastSyncTime(sourceId: string): string | undefined {
    return this.#lastSyncTimes.get(sourceId);
  }

  public getSources(): CalendarSource[] {
    return this.#getOptions().sources;
  }

  async #syncSource(source: CalendarSource) {
    try {
      const client = await createDAVClient({
        serverUrl: source.url,
        credentials: {
          username: source.auth.username,
          password: source.auth.password,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });

      const calendars = await client.fetchCalendars();

      for (const calendar of calendars) {
        const objects = await client.fetchCalendarObjects({
          calendar,
        });

        const db = await this.#services.get(DatabaseService).get(database);

        const currentMasterUids = new Set<string>();

        for (const object of objects) {
          if (!object.data || !object.etag) continue;

          const events = this.#parseICalEvents(
            object.data,
            object.etag,
            source.id
          );

          if (events.length === 0) continue;

          const masterUid = events[0].master_uid;
          currentMasterUids.add(masterUid);

          const existingEvent = await db
            .selectFrom('calendar_events')
            .select('etag')
            .where('master_uid', '=', masterUid)
            .where('calendar_id', '=', source.id)
            .executeTakeFirst();

          if (existingEvent && existingEvent.etag !== object.etag) {
            await db
              .deleteFrom('calendar_events')
              .where('master_uid', '=', masterUid)
              .where('calendar_id', '=', source.id)
              .execute();
          }

          for (const event of events) {
            await db
              .insertInto('calendar_events')
              .values(event)
              .onConflict((oc) =>
                oc.column('uid').doUpdateSet((eb) => ({
                  master_uid: eb.ref('excluded.master_uid'),
                  calendar_id: eb.ref('excluded.calendar_id'),
                  summary: eb.ref('excluded.summary'),
                  description: eb.ref('excluded.description'),
                  location: eb.ref('excluded.location'),
                  start_at: eb.ref('excluded.start_at'),
                  end_at: eb.ref('excluded.end_at'),
                  all_day: eb.ref('excluded.all_day'),
                  is_recurring: eb.ref('excluded.is_recurring'),
                  recurrence_id: eb.ref('excluded.recurrence_id'),
                  raw_ical: eb.ref('excluded.raw_ical'),
                  etag: eb.ref('excluded.etag'),
                  synced_at: eb.ref('excluded.synced_at'),
                }))
              )
              .execute();
          }
        }

        await db
          .deleteFrom('calendar_events')
          .where('calendar_id', '=', source.id)
          .where('master_uid', 'not in', Array.from(currentMasterUids))
          .execute();
      }

      const now = new Date().toISOString();
      this.#lastSyncTimes.set(source.id, now);
    } catch (error) {
      console.error(`Failed to sync calendar ${source.id}:`, error);
      throw error;
    }
  }

  #parseICalEvents(
    icalData: string,
    etag: string,
    calendarId: string
  ): Array<{
    uid: string;
    master_uid: string;
    calendar_id: string;
    summary: string;
    description: string | null;
    location: string | null;
    start_at: string;
    end_at: string;
    all_day: number;
    is_recurring: number;
    recurrence_id: string | null;
    raw_ical: string;
    etag: string;
    synced_at: string;
  }> {
    const events: Array<{
      uid: string;
      master_uid: string;
      calendar_id: string;
      summary: string;
      description: string | null;
      location: string | null;
      start_at: string;
      end_at: string;
      all_day: number;
      is_recurring: number;
      recurrence_id: string | null;
      raw_ical: string;
      etag: string;
      synced_at: string;
    }> = [];

    const syncedAt = new Date().toISOString();

    const lines = icalData.split(/\r?\n/);
    let currentEvent: Record<string, string> = {};
    let inEvent = false;

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {};
      } else if (line === 'END:VEVENT') {
        if (currentEvent.UID) {
          const expanded = this.#expandEvent(
            currentEvent,
            etag,
            calendarId,
            syncedAt
          );
          events.push(...expanded);
        }
        inEvent = false;
      } else if (inEvent) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);
          const cleanKey = key.split(';')[0];
          currentEvent[cleanKey] = value;
        }
      }
    }

    return events;
  }

  #expandEvent(
    vevent: Record<string, string>,
    etag: string,
    calendarId: string,
    syncedAt: string
  ): Array<{
    uid: string;
    master_uid: string;
    calendar_id: string;
    summary: string;
    description: string | null;
    location: string | null;
    start_at: string;
    end_at: string;
    all_day: number;
    is_recurring: number;
    recurrence_id: string | null;
    raw_ical: string;
    etag: string;
    synced_at: string;
  }> {
    const uid = vevent.UID;
    const summary = vevent.SUMMARY || '';
    const description = vevent.DESCRIPTION || null;
    const location = vevent.LOCATION || null;
    const dtstart = vevent.DTSTART;
    const dtend = vevent.DTEND || vevent.DTSTART;
    const rrule = vevent.RRULE;
    const rawIcal = JSON.stringify(vevent);

    const isAllDay = dtstart.length === 8;
    const startDate = this.#parseICalDate(dtstart);
    const endDate = this.#parseICalDate(dtend);

    if (!rrule) {
      return [
        {
          uid,
          master_uid: uid,
          calendar_id: calendarId,
          summary,
          description,
          location,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
          all_day: isAllDay ? 1 : 0,
          is_recurring: 0,
          recurrence_id: null,
          raw_ical: rawIcal,
          etag,
          synced_at: syncedAt,
        },
      ];
    }

    const options = this.#getOptions();
    const window = options.expansionWindow || {};
    const pastMonths = window.pastMonths ?? 6;
    const futureMonths = window.futureMonths ?? 12;

    const now = new Date();
    const startWindow = new Date(now);
    startWindow.setMonth(startWindow.getMonth() - pastMonths);
    const endWindow = new Date(now);
    endWindow.setMonth(endWindow.getMonth() + futureMonths);

    try {
      const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${rrule}`, {
        forceset: false,
      }) as RRule;

      const occurrences = rule.between(startWindow, endWindow, true);

      return occurrences.map((occurrence) => {
        const duration = endDate.getTime() - startDate.getTime();
        const occurrenceEnd = new Date(occurrence.getTime() + duration);
        const occurrenceId = this.#formatDateForUid(occurrence);

        return {
          uid: `${uid}_${occurrenceId}`,
          master_uid: uid,
          calendar_id: calendarId,
          summary,
          description,
          location,
          start_at: occurrence.toISOString(),
          end_at: occurrenceEnd.toISOString(),
          all_day: isAllDay ? 1 : 0,
          is_recurring: 1,
          recurrence_id: null,
          raw_ical: rawIcal,
          etag,
          synced_at: syncedAt,
        };
      });
    } catch (error) {
      console.error(`Failed to expand RRULE for event ${uid}:`, error);
      return [
        {
          uid,
          master_uid: uid,
          calendar_id: calendarId,
          summary,
          description,
          location,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
          all_day: isAllDay ? 1 : 0,
          is_recurring: 0,
          recurrence_id: null,
          raw_ical: rawIcal,
          etag,
          synced_at: syncedAt,
        },
      ];
    }
  }

  #parseICalDate(dateStr: string): Date {
    if (dateStr.length === 8) {
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1;
      const day = parseInt(dateStr.substring(6, 8), 10);
      return new Date(year, month, day);
    }

    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hour = parseInt(dateStr.substring(9, 11), 10);
    const minute = parseInt(dateStr.substring(11, 13), 10);
    const second = parseInt(dateStr.substring(13, 15), 10);

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  #formatDateForUid(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}

export { CalendarSyncService };
