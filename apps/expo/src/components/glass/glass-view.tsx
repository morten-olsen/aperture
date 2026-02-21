import type { ReactNode } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { YStack, useThemeName } from 'tamagui';

type GlassIntensity = 'subtle' | 'medium' | 'strong';

type GlassViewProps = {
  intensity?: GlassIntensity;
  children?: ReactNode;
  borderRadius?: number;
  padding?: number;
  style?: ViewStyle;
};

const BLUR_MAP: Record<GlassIntensity, number> = {
  subtle: 20,
  medium: 40,
  strong: 60,
};

// Thin tint layered on top of BlurView (iOS/Web)
const BLUR_TINT: Record<GlassIntensity, { light: string; dark: string }> = {
  subtle: { light: 'rgba(255,255,255,0.25)', dark: 'rgba(30,30,40,0.25)' },
  medium: { light: 'rgba(255,255,255,0.35)', dark: 'rgba(30,30,40,0.35)' },
  strong: { light: 'rgba(255,255,255,0.45)', dark: 'rgba(30,30,40,0.45)' },
};

// Android fallback — translucent overlay without blur
const ANDROID_OVERLAY: Record<GlassIntensity, { light: string; dark: string }> = {
  subtle: { light: 'rgba(255,255,255,0.35)', dark: 'rgba(30,30,40,0.35)' },
  medium: { light: 'rgba(255,255,255,0.50)', dark: 'rgba(30,30,40,0.50)' },
  strong: { light: 'rgba(255,255,255,0.62)', dark: 'rgba(30,30,40,0.62)' },
};

const supportsBlur = Platform.OS === 'ios' || Platform.OS === 'web';

const GlassView = ({ intensity = 'medium', children, borderRadius = 24, padding, style }: GlassViewProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const mode = isDark ? 'dark' : 'light';
  const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.025)';
  const overlay = supportsBlur ? BLUR_TINT[intensity][mode] : ANDROID_OVERLAY[intensity][mode];

  return (
    <YStack
      borderRadius={borderRadius}
      borderWidth={1}
      borderColor={borderColor}
      overflow="hidden"
      padding={padding}
      style={style}
    >
      {supportsBlur ? (
        <BlurView intensity={BLUR_MAP[intensity]} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      ) : null}
      <YStack style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
      <YStack style={{ position: 'relative', zIndex: 1 }}>{children}</YStack>
    </YStack>
  );
};

export type { GlassViewProps, GlassIntensity };
export { GlassView };
