import React from 'react';
import type { Preview } from '@storybook/react-native-web-vite';
import { TamaguiProvider, Theme, YStack } from 'tamagui';

import { tamaguiConfig } from '../src/theme/tamagui.config.ts';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  globalTypes: {
    theme: {
      description: 'Theme for components',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [
    (Story, context) => (
      <TamaguiProvider config={tamaguiConfig}>
        <Theme name={context.globals.theme ?? 'light'}>
          <YStack backgroundColor="$background" style={{ minHeight: '100dvh' }}>
            <Story />
          </YStack>
        </Theme>
      </TamaguiProvider>
    ),
  ],
};

export default preview;
