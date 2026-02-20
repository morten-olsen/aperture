import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  type AnimatedStyle,
} from 'react-native-reanimated';

type MountAnimationOptions = {
  delay?: number;
  duration?: number;
  translateY?: number;
  translateX?: number;
  scale?: number;
};

const useMountAnimation = ({
  delay = 0,
  duration = 400,
  translateY = 0,
  translateX = 0,
  scale = 1,
}: MountAnimationOptions = {}): { style: AnimatedStyle } => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: translateY * (1 - progress.value) },
      { translateX: translateX * (1 - progress.value) },
      { scale: scale + (1 - scale) * progress.value },
    ],
  }));

  return { style };
};

export type { MountAnimationOptions };
export { useMountAnimation };
