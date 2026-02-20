import { config } from '@tamagui/config/v3';
import { createFont, createTamagui, createTokens } from 'tamagui';

// System font stack — prioritize platform native fonts over Inter
const systemFamily =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const systemDisplayFamily =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const monoFamily = '"SF Mono", Menlo, Monaco, "Cascadia Mono", Consolas, monospace';

const bodyFont = createFont({
  family: systemFamily,
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    true: 14,
    5: 16,
    6: 18,
    7: 20,
    8: 24,
    9: 32,
    10: 48,
  },
  lineHeight: {
    1: 14,
    2: 16,
    3: 17,
    4: 19,
    true: 19,
    5: 21,
    6: 23,
    7: 26,
    8: 30,
    9: 38,
    10: 56,
  },
  weight: {
    1: '400',
    3: '400',
    4: '400',
    5: '500',
    6: '600',
    7: '700',
    true: '400',
  },
  letterSpacing: {
    1: 0.2,
    2: 0.1,
    3: 0,
    4: 0,
    true: 0,
    5: -0.1,
    6: -0.2,
    7: -0.3,
    8: -0.4,
    9: -0.5,
    10: -0.8,
  },
});

const headingFont = createFont({
  family: systemDisplayFamily,
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    true: 14,
    5: 17,
    6: 20,
    7: 24,
    8: 28,
    9: 34,
    10: 48,
  },
  lineHeight: {
    1: 14,
    2: 16,
    3: 17,
    4: 19,
    true: 19,
    5: 22,
    6: 25,
    7: 29,
    8: 34,
    9: 41,
    10: 56,
  },
  weight: {
    1: '400',
    3: '400',
    4: '500',
    5: '600',
    6: '600',
    7: '700',
    8: '700',
    9: '800',
    true: '700',
  },
  letterSpacing: {
    1: 0.2,
    2: 0.1,
    3: 0,
    4: 0,
    true: 0,
    5: -0.2,
    6: -0.3,
    7: -0.4,
    8: -0.5,
    9: -0.8,
    10: -1.2,
  },
});

const monoFont = createFont({
  family: monoFamily,
  size: {
    1: 10,
    2: 11,
    3: 12,
    4: 13,
    true: 13,
    5: 14,
    6: 16,
    7: 18,
    8: 21,
    9: 28,
    10: 42,
  },
  lineHeight: {
    1: 14,
    2: 16,
    3: 17,
    4: 18,
    true: 18,
    5: 20,
    6: 22,
    7: 25,
    8: 28,
    9: 36,
    10: 52,
  },
  weight: {
    1: '400',
    4: '400',
    5: '500',
    6: '600',
    true: '400',
  },
  letterSpacing: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    true: 0,
    5: 0,
  },
});

const tokens = createTokens({
  ...config.tokens,
  radius: {
    ...config.tokens.radius,
    card: 18,
    bubble: 20,
    button: 12,
    input: 22,
    badge: 8,
    full: 9999,
  },
});

// Semantic theme tokens layered on top of the v3 base themes.
// These map to design-principal.md's color system.
const lightThemeExtensions = {
  // Surfaces (depth layering)
  surface: '#ffffff',
  surfaceHover: config.themes.light.gray2,
  surfaceRaised: '#ffffff',
  surfaceRaisedHover: config.themes.light.gray2,

  // Text hierarchy
  colorSubtle: config.themes.light.gray11,
  colorMuted: config.themes.light.gray9,

  // Borders
  borderSubtle: config.themes.light.gray4,

  // Accent (primary actions, user identity)
  accent: config.themes.light.blue9,
  accentHover: config.themes.light.blue10,
  accentPress: config.themes.light.blue8,
  accentSurface: config.themes.light.blue3,
  accentText: '#ffffff',

  // Semantic status
  success: config.themes.light.green9,
  successSurface: config.themes.light.green3,
  warning: config.themes.light.yellow9,
  warningSurface: config.themes.light.yellow3,
  danger: config.themes.light.red9,
  dangerSurface: config.themes.light.red3,

  // Chat-specific
  chatUser: config.themes.light.blue9,
  chatUserText: '#ffffff',
  chatAssistant: '#ffffff',
  chatAssistantBorder: config.themes.light.gray3,
  chatTool: config.themes.light.gray2,
  chatToolBorder: config.themes.light.gray4,
} as const;

const darkThemeExtensions = {
  // Surfaces (depth layering — lighter = closer in dark mode)
  surface: config.themes.dark.gray2,
  surfaceHover: config.themes.dark.gray3,
  surfaceRaised: config.themes.dark.gray3,
  surfaceRaisedHover: config.themes.dark.gray4,

  // Text hierarchy
  colorSubtle: config.themes.dark.gray11,
  colorMuted: config.themes.dark.gray9,

  // Borders
  borderSubtle: config.themes.dark.gray4,

  // Accent
  accent: config.themes.dark.blue9,
  accentHover: config.themes.dark.blue10,
  accentPress: config.themes.dark.blue8,
  accentSurface: config.themes.dark.blue3,
  accentText: '#ffffff',

  // Semantic status
  success: config.themes.dark.green9,
  successSurface: config.themes.dark.green3,
  warning: config.themes.dark.yellow9,
  warningSurface: config.themes.dark.yellow3,
  danger: config.themes.dark.red9,
  dangerSurface: config.themes.dark.red3,

  // Chat-specific
  chatUser: config.themes.dark.blue9,
  chatUserText: '#ffffff',
  chatAssistant: config.themes.dark.gray3,
  chatAssistantBorder: config.themes.dark.gray5,
  chatTool: config.themes.dark.gray2,
  chatToolBorder: config.themes.dark.gray5,
} as const;

const themes = {
  ...config.themes,
  light: { ...config.themes.light, ...lightThemeExtensions },
  dark: { ...config.themes.dark, ...darkThemeExtensions },
} as const;

const tamaguiConfig = createTamagui({
  ...config,
  tokens,
  themes,
  fonts: {
    body: bodyFont,
    heading: headingFont,
    mono: monoFont,
  },
  settings: {
    ...config.settings,
    defaultFont: 'body',
  },
});

type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends Conf {}
}

export { tamaguiConfig };
