import { defineConfig, type UserConfigExport } from 'vitest/config';

// eslint-disable-next-line import/no-default-export
export default defineConfig(async () => {
  const config: UserConfigExport = {
    test: {
      coverage: {
        provider: 'v8',
        include: ['packages/**/src/**/*.ts'],
      },
    },
  };
  return config;
});
