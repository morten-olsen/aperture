import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { Pressable, type LayoutChangeEvent } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, Text } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useMountAnimation } from '../../hooks/use-mount-animation.ts';
import { GlassView } from '../glass/glass-view.tsx';
import { KeyboardAwareView } from '../keyboard/keyboard-aware-view.tsx';

type ListScreenChildContext = {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  contentPadding: number;
};

type ListScreenProps = {
  onBack: () => void;
  title: string;
  headerRight?: ReactNode;
  overlay?: ReactNode;
  children: (ctx: ListScreenChildContext) => ReactNode;
};

const NAV_ROW_HEIGHT = 52;
const NAV_PADDING_TOP = 16;
const NAV_PADDING_BOTTOM = 8;
const LARGE_FONT_SIZE = 38;
const SMALL_FONT_SIZE = 17;
const COLLAPSE_DISTANCE = 76;
const TITLE_SCALE = SMALL_FONT_SIZE / LARGE_FONT_SIZE;

const BACK_BUTTON_SIZE = 42;
const INLINE_TITLE_GAP = 14;

const ListScreen = ({ onBack, title, headerRight, overlay, children }: ListScreenProps) => {
  const insets = useSafeAreaInsets();
  const scrollOffset = useSharedValue(0);
  const titleWidth = useSharedValue(0);
  const titleHeight = useSharedValue(0);
  const titleMountProgress = useSharedValue(0);

  const headerAnim = useMountAnimation({ translateY: -10, duration: 300, delay: 200 });

  useEffect(() => {
    titleMountProgress.value = withDelay(300, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
  }, [titleMountProgress]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const navHeight = insets.top + NAV_PADDING_TOP + NAV_ROW_HEIGHT + NAV_PADDING_BOTTOM;
  const expandedHeight = navHeight + COLLAPSE_DISTANCE;

  const paddingH = 20; // $5
  const largeX = paddingH;
  const largeY = navHeight + 16; // below nav row + $4 padding
  const smallX = paddingH + BACK_BUTTON_SIZE + INLINE_TITLE_GAP;
  const navCenterY = insets.top + NAV_PADDING_TOP + NAV_ROW_HEIGHT / 2;

  const onTitleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      titleWidth.value = event.nativeEvent.layout.width;
      titleHeight.value = event.nativeEvent.layout.height;
    },
    [titleWidth, titleHeight],
  );

  const titleStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollOffset.value, [0, COLLAPSE_DISTANCE], [0, 1], 'clamp');
    const scale = interpolate(progress, [0, 1], [1, TITLE_SCALE]);

    // RN scales around center; offset to simulate top-left origin
    const compensateX = (titleWidth.value * (1 - scale)) / 2;
    const compensateY = (titleHeight.value * (1 - scale)) / 2;

    // Center the scaled title vertically with the back button
    const smallY = navCenterY - (titleHeight.value * scale) / 2;

    const x = interpolate(progress, [0, 1], [largeX, smallX]) - compensateX;
    const y = interpolate(progress, [0, 1], [largeY, smallY]) - compensateY;

    const mountOffset = 10 * (1 - titleMountProgress.value);

    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      opacity: titleMountProgress.value,
      transform: [{ translateX: x }, { translateY: y + mountOffset }, { scale }],
    };
  });

  const glassStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollOffset.value, [0, COLLAPSE_DISTANCE], [0, 1], 'clamp'),
  }));

  const separatorStyle = useAnimatedStyle(() => ({
    height: 0.5,
    opacity: interpolate(scrollOffset.value, [COLLAPSE_DISTANCE * 0.5, COLLAPSE_DISTANCE], [0, 1], 'clamp'),
    backgroundColor: 'rgba(128,128,128,0.3)',
  }));

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      {children({ scrollHandler, contentPadding: expandedHeight })}

      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnim.style]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: navHeight }, glassStyle]}
          pointerEvents="none"
        >
          <GlassView intensity="strong" borderRadius={0} padding={0} style={{ flex: 1 }} />
        </Animated.View>

        <XStack
          paddingHorizontal="$5"
          paddingTop={insets.top + NAV_PADDING_TOP}
          paddingBottom={NAV_PADDING_BOTTOM}
          alignItems="center"
          height={navHeight}
          pointerEvents="box-none"
        >
          <Pressable onPress={onBack} hitSlop={12}>
            <GlassView
              intensity="subtle"
              borderRadius={9999}
              padding={0}
              style={{
                width: BACK_BUTTON_SIZE,
                height: BACK_BUTTON_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft size={24} color="$accent" />
            </GlassView>
          </Pressable>
          <YStack flex={1} />
          {headerRight}
        </XStack>

        <Animated.View style={titleStyle} onLayout={onTitleLayout} pointerEvents="none">
          <Text fontFamily="$heading" fontSize={LARGE_FONT_SIZE} fontWeight="700" letterSpacing={-1} color="$color">
            {title}
          </Text>
        </Animated.View>

        <Animated.View style={separatorStyle} />
      </Animated.View>

      {overlay}
    </KeyboardAwareView>
  );
};

export type { ListScreenProps, ListScreenChildContext };
export { ListScreen };
