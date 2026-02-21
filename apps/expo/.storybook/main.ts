import { createRequire } from 'node:module';

import type { StorybookConfig } from '@storybook/react-native-web-vite';

const require = createRequire(import.meta.url);

const config: StorybookConfig = {
  framework: '@storybook/react-native-web-vite',
  stories: ['../src/components/**/*.stories.tsx'],
  viteFinal: (config) => {
    const existingAlias = Array.isArray(config.resolve?.alias)
      ? config.resolve.alias
      : [];
    config.resolve = {
      ...config.resolve,
      alias: [
        ...existingAlias,
        {
          find: /^react-native-reanimated$/,
          replacement: require.resolve('react-native-reanimated/mock'),
        },
      ],
    };
    return config;
  },
};

export default config;
