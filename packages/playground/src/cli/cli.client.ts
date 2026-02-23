import { ApertureClient } from '@morten-olsen/agentic-client';

const createClient = () => {
  const baseUrl = process.env['GLADOS_URL'];
  if (!baseUrl) {
    throw new Error('GLADOS_URL environment variable is required');
  }
  const userId = process.env['GLADOS_USER_ID'] ?? 'cli';
  const prefix = process.env['GLADOS_PREFIX'] ?? '/api';
  return new ApertureClient({ baseUrl, userId, prefix });
};

export { createClient };
