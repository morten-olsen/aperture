import { defineConfig, type UserConfigExport } from 'vitest/config';

import { getAliases } from './packages/tests/src/vitest.js';

// eslint-disable-next-line import/no-default-export
export default defineConfig(async () => {
  const aliases = await getAliases();
  const config: UserConfigExport = {
    resolve: {
      alias: aliases,
    },
    test: {
      exclude: ['**/dist/**', '**/node_modules/**'],
      coverage: {
        provider: 'v8',
        include: ['packages/**/src/**/*.ts'],
      },
    },
  };
  return config;
});
