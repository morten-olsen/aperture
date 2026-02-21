if (process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true') {
  const { registerRootComponent } = require('expo');
  const { default: Storybook } = require('./.rnstorybook');
  registerRootComponent(Storybook);
} else {
  require('expo-router/entry');
}
