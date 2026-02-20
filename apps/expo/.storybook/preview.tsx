import React from 'react';
import type { Preview } from '@storybook/react-native-web-vite';
import { TamaguiProvider, Theme, YStack } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tamaguiConfig } from '../src/theme/tamagui.config.ts';
import { AuraBackground } from '../src/components/aura/aura-background.tsx';

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
      <SafeAreaProvider>
        <TamaguiProvider config={tamaguiConfig}>
          <Theme name={context.globals.theme ?? 'light'}>
            <YStack backgroundColor="$backgroundBase" style={{ minHeight: '100dvh' }}>
              <AuraBackground />
              <Story />
            </YStack>
          </Theme>
        </TamaguiProvider>
      </SafeAreaProvider>
    ),
  ],
};

export default preview;
