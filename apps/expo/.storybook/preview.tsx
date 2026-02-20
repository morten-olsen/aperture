import React from 'react';
import type { Preview } from '@storybook/react-native-web-vite';
import { TamaguiProvider, Theme } from 'tamagui';

import { tamaguiConfig } from '../src/theme/tamagui.config.ts';

const preview: Preview = {
  decorators: [
    (Story) => (
      <TamaguiProvider config={tamaguiConfig}>
        <Theme name="light">
          <Story />
        </Theme>
      </TamaguiProvider>
    ),
  ],
};

export default preview;
