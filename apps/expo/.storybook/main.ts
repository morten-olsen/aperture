import type { StorybookConfig } from '@storybook/react-native-web-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-native-web-vite',
  stories: ['../src/components/**/*.stories.tsx'],
  addons: ['@storybook/addon-actions'],
};

export default config;
