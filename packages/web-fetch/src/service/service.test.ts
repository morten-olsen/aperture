import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Services } from '@morten-olsen/agentic-core';
import { DatabaseService } from '@morten-olsen/agentic-database';

import { database } from '../database/database.js';

import { WebFetchService } from './service.js';

const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Hello World</h1>
  <p>Some content here.</p>
  <a href="/about">About Us</a>
  <a href="https://example.com/contact">Contact</a>
  <a href="/nested"><span>Nested Link</span></a>
</body>
</html>`;

const server = setupServer();

describe('WebFetchService', () => {
  let services: Services;
  let service: WebFetchService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  beforeEach(async () => {
    services = Services.mock();
    const dbService = services.get(DatabaseService);
    await dbService.get(database);
    service = services.get(WebFetchService);
  });

  describe('domain allowlist', () => {
    it('starts with an empty allowlist', async () => {
      const domains = await service.listDomains();
      expect(domains).toEqual([]);
    });

    it('adds a domain and reports it was added', async () => {
      const added = await service.addDomain('example.com');
      expect(added).toBe(true);

      const domains = await service.listDomains();
      expect(domains).toEqual(['example.com']);
    });

    it('normalizes domains to lowercase', async () => {
      await service.addDomain('Example.COM');
      const domains = await service.listDomains();
      expect(domains).toEqual(['example.com']);
    });

    it('returns false when adding a duplicate domain', async () => {
      await service.addDomain('example.com');
      const added = await service.addDomain('example.com');
      expect(added).toBe(false);
    });

    it('removes a domain and reports it was removed', async () => {
      await service.addDomain('example.com');
      const removed = await service.removeDomain('example.com');
      expect(removed).toBe(true);

      const domains = await service.listDomains();
      expect(domains).toEqual([]);
    });

    it('returns false when removing a non-existent domain', async () => {
      const removed = await service.removeDomain('nope.com');
      expect(removed).toBe(false);
    });

    it('checks domain allowance correctly', async () => {
      await service.addDomain('example.com');
      expect(await service.isAllowed('example.com')).toBe(true);
      expect(await service.isAllowed('other.com')).toBe(false);
    });

    it('lists domains in alphabetical order', async () => {
      await service.addDomain('zeta.com');
      await service.addDomain('alpha.com');
      await service.addDomain('mid.com');

      const domains = await service.listDomains();
      expect(domains).toEqual(['alpha.com', 'mid.com', 'zeta.com']);
    });
  });

  describe('fetch', () => {
    it('rejects fetches to domains not on the allowlist', async () => {
      await expect(service.fetch({ url: 'https://blocked.com/page' })).rejects.toThrow(
        'Domain "blocked.com" is not on the allowlist',
      );
    });

    it('fetches HTML content in html mode', async () => {
      server.use(http.get('https://example.com/page', () => HttpResponse.html(TEST_HTML)));
      await service.addDomain('example.com');

      const result = await service.fetch({ url: 'https://example.com/page', mode: 'html' });

      expect(result.url).toBe('https://example.com/page');
      expect(result.domain).toBe('example.com');
      expect(result.mode).toBe('html');
      expect(result.content).toContain('<h1>Hello World</h1>');
      expect(result.truncated).toBe(false);
      expect(result.contentLength).toBe(TEST_HTML.length);
    });

    it('converts HTML to markdown in markdown mode', async () => {
      server.use(http.get('https://example.com/page', () => HttpResponse.html(TEST_HTML)));
      await service.addDomain('example.com');

      const result = await service.fetch({ url: 'https://example.com/page', mode: 'markdown' });

      expect(result.mode).toBe('markdown');
      expect(result.content).toContain('Hello World');
      expect(result.content).not.toContain('<h1>');
    });

    it('defaults to markdown mode', async () => {
      server.use(http.get('https://example.com/page', () => HttpResponse.html(TEST_HTML)));
      await service.addDomain('example.com');

      const result = await service.fetch({ url: 'https://example.com/page' });
      expect(result.mode).toBe('markdown');
    });

    it('extracts links in links mode', async () => {
      server.use(http.get('https://example.com/page', () => HttpResponse.html(TEST_HTML)));
      await service.addDomain('example.com');

      const result = await service.fetch({ url: 'https://example.com/page', mode: 'links' });

      expect(result.mode).toBe('links');
      const links = JSON.parse(result.content) as { text: string; href: string }[];
      expect(links).toHaveLength(3);
      expect(links[0]).toEqual({ text: 'About Us', href: 'https://example.com/about' });
      expect(links[1]).toEqual({ text: 'Contact', href: 'https://example.com/contact' });
      expect(links[2]).toEqual({ text: 'Nested Link', href: 'https://example.com/nested' });
    });

    it('truncates content when exceeding maxCharacters', async () => {
      const longContent = '<html><body>' + 'x'.repeat(1000) + '</body></html>';
      server.use(http.get('https://example.com/long', () => HttpResponse.html(longContent)));
      await service.addDomain('example.com');

      const result = await service.fetch({
        url: 'https://example.com/long',
        mode: 'html',
        maxCharacters: 50,
      });

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBe(50);
      expect(result.contentLength).toBeGreaterThan(50);
    });

    it('throws on non-2xx responses', async () => {
      server.use(
        http.get('https://example.com/404', () => new HttpResponse(null, { status: 404, statusText: 'Not Found' })),
      );
      await service.addDomain('example.com');

      await expect(service.fetch({ url: 'https://example.com/404', mode: 'html' })).rejects.toThrow('HTTP 404');
    });

    it('sends the configured User-Agent header', async () => {
      let capturedUserAgent = '';
      server.use(
        http.get('https://example.com/ua', ({ request }) => {
          capturedUserAgent = request.headers.get('User-Agent') ?? '';
          return HttpResponse.html('<html><body>ok</body></html>');
        }),
      );
      await service.addDomain('example.com');

      service.configure({ userAgent: 'TestBot/2.0' });
      await service.fetch({ url: 'https://example.com/ua', mode: 'html' });

      expect(capturedUserAgent).toBe('TestBot/2.0');
    });

    it('respects configured defaultMode', async () => {
      server.use(http.get('https://example.com/page', () => HttpResponse.html(TEST_HTML)));
      await service.addDomain('example.com');

      service.configure({ defaultMode: 'html' });
      const result = await service.fetch({ url: 'https://example.com/page' });
      expect(result.mode).toBe('html');
    });
  });
});
