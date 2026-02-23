import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text, useThemeName } from 'tamagui';
import { ArrowLeft, Sun, Moon, Monitor, Check } from '@tamagui/lucide-icons';
import Animated from 'react-native-reanimated';
import { useColorScheme } from 'react-native';

import { useMountAnimation } from '../../src/hooks/use-mount-animation';
import { GlassView } from '../../src/components/glass/glass-view';
import { KeyboardAwareView } from '../../src/components/keyboard/keyboard-aware-view';

type ThemeOption = 'light' | 'dark' | 'system';

const AppearanceRoute = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeName = useThemeName();
  const colorScheme = useColorScheme();
  const isDark = themeName === 'dark';

  // For now, just show current theme - full theme switching would need context/storage
  const currentTheme: ThemeOption = 'system';

  const headerAnim = useMountAnimation({ duration: 400, delay: 200 });
  const titleAnim = useMountAnimation({ translateY: 10, duration: 450, delay: 300 });
  const contentAnim = useMountAnimation({ translateY: 10, duration: 500, delay: 400 });

  const ThemeOption = ({
    label,
    description,
    value,
    icon: Icon,
  }: {
    label: string;
    description: string;
    value: ThemeOption;
    icon: typeof Sun;
  }) => {
    const isSelected = currentTheme === value;

    return (
      <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <GlassView
          intensity={isSelected ? 'medium' : 'subtle'}
          borderRadius={16}
          padding={16}
          style={
            isSelected
              ? {
                  borderColor: isDark ? 'rgba(79,109,245,0.3)' : 'rgba(79,109,245,0.2)',
                  borderWidth: 1,
                }
              : undefined
          }
        >
          <XStack alignItems="center" gap={14}>
            <XStack
              width={44}
              height={44}
              borderRadius={12}
              backgroundColor={isSelected ? '$accent' : isDark ? 'rgba(79,109,245,0.15)' : '$accentSurface'}
              alignItems="center"
              justifyContent="center"
            >
              <Icon size={20} color={isSelected ? '$accentText' : '$accent'} />
            </XStack>
            <YStack flex={1} gap={2}>
              <Text fontSize={16} fontWeight="600" color="$color">
                {label}
              </Text>
              <Text fontSize={13} color="$colorMuted">
                {description}
              </Text>
            </YStack>
            {isSelected && (
              <XStack
                width={24}
                height={24}
                borderRadius="$full"
                backgroundColor="$accent"
                alignItems="center"
                justifyContent="center"
              >
                <Check size={14} color="$accentText" strokeWidth={3} />
              </XStack>
            )}
          </XStack>
        </GlassView>
      </Pressable>
    );
  };

  return (
    <KeyboardAwareView style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={headerAnim.style}>
        <YStack paddingHorizontal="$5" paddingTop="$4" paddingBottom="$2">
          <XStack alignItems="center" height={52}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <GlassView
                intensity="subtle"
                borderRadius={9999}
                padding={0}
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowLeft size={24} color="$accent" />
              </GlassView>
            </Pressable>
          </XStack>
        </YStack>
      </Animated.View>

      <Animated.View style={titleAnim.style}>
        <Text
          fontFamily="$heading"
          fontSize={34}
          fontWeight="700"
          letterSpacing={-1}
          color="$color"
          paddingHorizontal="$5"
          paddingTop="$4"
          paddingBottom="$3"
        >
          Appearance
        </Text>
      </Animated.View>

      <Animated.View style={contentAnim.style}>
        <YStack paddingHorizontal="$5" gap={12}>
          <Text
            fontSize={12}
            fontWeight="600"
            color="$colorMuted"
            textTransform="uppercase"
            letterSpacing={0.5}
            paddingBottom={4}
          >
            Theme
          </Text>

          <ThemeOption
            icon={Monitor}
            label="System"
            description={`Follows device settings (${colorScheme})`}
            value="system"
          />
          <ThemeOption icon={Sun} label="Light" description="Always use light mode" value="light" />
          <ThemeOption icon={Moon} label="Dark" description="Always use dark mode" value="dark" />

          <Text fontSize={13} color="$colorMuted" paddingTop={8}>
            Theme preference is stored on this device. Choose System to automatically match your device settings.
          </Text>
        </YStack>
      </Animated.View>
    </KeyboardAwareView>
  );
};

export default AppearanceRoute;
