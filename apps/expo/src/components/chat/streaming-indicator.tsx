import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { XStack } from 'tamagui';

const DOT_COUNT = 3;
const PULSE_DURATION = 300;
const STAGGER = 150;

const Dot = ({ index }: { index: number }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    const delay = index * STAGGER;
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1.3, { duration: PULSE_DURATION }), withTiming(1, { duration: PULSE_DURATION })),
        -1,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(0.9, { duration: PULSE_DURATION }), withTiming(0.25, { duration: PULSE_DURATION })),
        -1,
      ),
    );
  }, [index, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(150,150,170,1)',
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style} />;
};

const StreamingIndicator = () => (
  <XStack paddingVertical="$3" gap="$2" alignItems="center">
    {Array.from({ length: DOT_COUNT }, (_, i) => (
      <Dot key={i} index={i} />
    ))}
  </XStack>
);

export { StreamingIndicator };
