import React from 'react';
import type { Preview } from '@storybook/react';
import { TamaguiProvider, Theme, YStack } from 'tamagui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tamaguiConfig } from '../src/theme/tamagui.config';
import { AuraBackground } from '../src/components/aura/aura-background';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <SafeAreaProvider>
        <TamaguiProvider config={tamaguiConfig}>
          <Theme name="dark">
            <YStack backgroundColor="$backgroundBase" flex={1}>
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
