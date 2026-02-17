import { defineConfig } from 'vitest/config';
import { getAliases } from '@morten-olsen/agentic-tests/vitest';

// eslint-disable-next-line import/no-default-export
export default defineConfig(async () => {
  const aliases = await getAliases();
  return {
    resolve: {
      alias: aliases,
    },
    test: {
      exclude: ['**/dist/**', '**/node_modules/**'],
    },
  };
});
