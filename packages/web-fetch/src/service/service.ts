import type { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';
import TurndownService from 'turndown';

import type { FetchMode, FetchResult, WebFetchPluginOptions } from '../schemas/schemas.js';
import { database } from '../database/database.js';

class WebFetchService {
  #services: Services;
  #options: Required<WebFetchPluginOptions>;

  constructor(services: Services) {
    this.#services = services;
    this.#options = {
      maxCharacters: 50_000,
      defaultMode: 'markdown',
      userAgent: 'GLaDOS-Agent/1.0',
    };
  }

  configure = (options: WebFetchPluginOptions) => {
    this.#options = {
      maxCharacters: options.maxCharacters ?? 50_000,
      defaultMode: options.defaultMode ?? 'markdown',
      userAgent: options.userAgent ?? 'GLaDOS-Agent/1.0',
    };
  };

  #getDb = async () => {
    const databaseService = this.#services.get(DatabaseService);
    const db = await databaseService.get(database);
    return db;
  };

  isAllowed = async (domain: string): Promise<boolean> => {
    const db = await this.#getDb();
    const row = await db
      .selectFrom('web_fetch_allowed_domains')
      .select('domain')
      .where('domain', '=', domain.toLowerCase())
      .executeTakeFirst();
    return row !== undefined;
  };

  addDomain = async (domain: string): Promise<boolean> => {
    const normalized = domain.toLowerCase();
    const exists = await this.isAllowed(normalized);
    if (exists) return false;

    const db = await this.#getDb();
    await db
      .insertInto('web_fetch_allowed_domains')
      .values({
        domain: normalized,
        created_at: new Date().toISOString(),
      })
      .execute();
    return true;
  };

  removeDomain = async (domain: string): Promise<boolean> => {
    const normalized = domain.toLowerCase();
    const db = await this.#getDb();
    const result = await db.deleteFrom('web_fetch_allowed_domains').where('domain', '=', normalized).execute();
    return result.length > 0 && Number(result[0].numDeletedRows) > 0;
  };

  listDomains = async (): Promise<string[]> => {
    const db = await this.#getDb();
    const rows = await db.selectFrom('web_fetch_allowed_domains').select('domain').orderBy('domain', 'asc').execute();
    return rows.map((r) => r.domain);
  };

  fetch = async (options: {
    url: string;
    mode?: FetchMode;
    maxCharacters?: number;
    force?: boolean;
  }): Promise<FetchResult> => {
    const mode = options.mode ?? this.#options.defaultMode;
    const maxChars = options.maxCharacters ?? this.#options.maxCharacters;

    const parsed = new URL(options.url);
    const domain = parsed.hostname.toLowerCase();

    if (!options.force) {
      const allowed = await this.isAllowed(domain);
      if (!allowed) {
        throw new Error(
          `Domain "${domain}" is not on the allowlist. Use web-fetch.add-domain to add it before fetching.`,
        );
      }
    }

    const response = await fetch(options.url, {
      headers: {
        'User-Agent': this.#options.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    let content: string;

    switch (mode) {
      case 'html': {
        content = html;
        break;
      }
      case 'markdown': {
        const turndown = new TurndownService();
        content = turndown.turndown(html);
        break;
      }
      case 'links': {
        const links = this.#extractLinks(html, options.url);
        content = JSON.stringify(links);
        break;
      }
    }

    const contentLength = content.length;
    const truncated = contentLength > maxChars;
    if (truncated) {
      content = content.slice(0, maxChars);
    }

    return {
      url: options.url,
      domain,
      mode,
      content,
      truncated,
      contentLength,
    };
  };

  #extractLinks = (html: string, baseUrl: string): { text: string; href: string }[] => {
    const linkRegex = /<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const links: { text: string; href: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]*>/g, '').trim();
      if (!href) continue;

      let resolvedHref: string;
      try {
        resolvedHref = new URL(href, baseUrl).toString();
      } catch {
        resolvedHref = href;
      }

      links.push({ text, href: resolvedHref });
    }

    return links;
  };
}

export { WebFetchService };
