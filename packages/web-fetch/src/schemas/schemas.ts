import { z } from 'zod';

const fetchModeSchema = z.enum(['html', 'markdown', 'links']);

type FetchMode = z.infer<typeof fetchModeSchema>;

const webFetchPluginOptionsSchema = z.object({
  maxCharacters: z.number().optional().describe('Maximum characters returned per fetch (default: 50000)'),
  defaultMode: fetchModeSchema.optional().describe('Default fetch mode (default: markdown)'),
  userAgent: z.string().optional().describe('Custom User-Agent header'),
});

type WebFetchPluginOptions = z.infer<typeof webFetchPluginOptionsSchema>;

const fetchResultSchema = z.object({
  url: z.string(),
  domain: z.string(),
  mode: fetchModeSchema,
  content: z.string(),
  truncated: z.boolean(),
  contentLength: z.number(),
});

type FetchResult = z.infer<typeof fetchResultSchema>;

const fetchInputSchema = z.object({
  url: z.string().describe('The URL to fetch'),
  mode: fetchModeSchema.optional().describe('Content mode: html, markdown, or links'),
  maxCharacters: z.number().optional().describe('Override the default character limit for this request'),
});

type FetchInput = z.infer<typeof fetchInputSchema>;

const addDomainInputSchema = z.object({
  domain: z.string().describe('The domain to allow (e.g. "example.com")'),
});

type AddDomainInput = z.infer<typeof addDomainInputSchema>;

const removeDomainInputSchema = z.object({
  domain: z.string().describe('The domain to remove from the allowlist'),
});

type RemoveDomainInput = z.infer<typeof removeDomainInputSchema>;

const addDomainOutputSchema = z.object({
  domain: z.string(),
  added: z.boolean(),
});

const removeDomainOutputSchema = z.object({
  domain: z.string(),
  removed: z.boolean(),
});

const listDomainsOutputSchema = z.object({
  domains: z.array(z.string()),
});

export {
  fetchModeSchema,
  webFetchPluginOptionsSchema,
  fetchResultSchema,
  fetchInputSchema,
  addDomainInputSchema,
  removeDomainInputSchema,
  addDomainOutputSchema,
  removeDomainOutputSchema,
  listDomainsOutputSchema,
};

export type { FetchMode, WebFetchPluginOptions, FetchResult, FetchInput, AddDomainInput, RemoveDomainInput };
