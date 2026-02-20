import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { YStack, useThemeName } from 'tamagui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type AuraVariant = 'default' | 'login' | 'chat';

type AuraBackgroundProps = {
  variant?: AuraVariant;
};

type OrbConfig = {
  color: string;
  cx: number;
  cy: number;
  r: string;
  opacity: number;
  cycleDuration: number;
  driftX: number;
  driftY: number;
};

const getOrbs = (variant: AuraVariant, isDark: boolean, width: number, height: number): OrbConfig[] => {
  const alpha = isDark ? 0.35 : 0.3;
  const driftScale = 0.03;

  switch (variant) {
    case 'login':
      return [
        {
          color: '#4F6DF5',
          cx: width * 0.2,
          cy: height * 0.25,
          r: '45%',
          opacity: alpha * 1.4,
          cycleDuration: 10000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
        {
          color: '#9B5DE5',
          cx: width * 0.8,
          cy: height * 0.45,
          r: '40%',
          opacity: alpha * 1.2,
          cycleDuration: 11000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
        {
          color: '#F15BB5',
          cx: width * 0.4,
          cy: height * 0.8,
          r: '35%',
          opacity: alpha,
          cycleDuration: 9000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
      ];
    case 'chat':
      return [
        {
          color: '#4F6DF5',
          cx: width * 0.85,
          cy: height * 0.08,
          r: '40%',
          opacity: alpha * 0.8,
          cycleDuration: 12000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
        {
          color: '#9B5DE5',
          cx: width * 0.1,
          cy: height * 0.85,
          r: '38%',
          opacity: alpha * 0.7,
          cycleDuration: 8000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
      ];
    default:
      return [
        {
          color: '#4F6DF5',
          cx: width * 0.15,
          cy: height * 0.15,
          r: '42%',
          opacity: alpha,
          cycleDuration: 10000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
        {
          color: '#9B5DE5',
          cx: width * 0.85,
          cy: height * 0.5,
          r: '38%',
          opacity: alpha * 0.9,
          cycleDuration: 11000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
        {
          color: '#F15BB5',
          cx: width * 0.45,
          cy: height * 0.9,
          r: '35%',
          opacity: alpha * 0.7,
          cycleDuration: 9000,
          driftX: width * driftScale,
          driftY: height * driftScale,
        },
      ];
  }
};

const DriftingOrb = ({ orb, index }: { orb: OrbConfig; index: number }) => {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  useEffect(() => {
    const easing = Easing.inOut(Easing.sin);
    offsetX.value = withRepeat(
      withSequence(
        withTiming(orb.driftX, { duration: orb.cycleDuration / 2, easing }),
        withTiming(-orb.driftX, { duration: orb.cycleDuration / 2, easing }),
      ),
      -1,
      true,
    );
    offsetY.value = withRepeat(
      withSequence(
        withTiming(-orb.driftY, { duration: orb.cycleDuration / 2, easing }),
        withTiming(orb.driftY, { duration: orb.cycleDuration / 2, easing }),
      ),
      -1,
      true,
    );
  }, [orb.driftX, orb.driftY, orb.cycleDuration, offsetX, offsetY]);

  const animatedProps = useAnimatedProps(() => ({
    cx: orb.cx + offsetX.value,
    cy: orb.cy + offsetY.value,
  }));

  return <AnimatedCircle animatedProps={animatedProps} r={orb.r} fill={`url(#orb-${index})`} opacity={orb.opacity} />;
};

const AuraBackground = ({ variant = 'default' }: AuraBackgroundProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const { width, height } = useWindowDimensions();
  const orbs = getOrbs(variant, isDark, width, height);

  return (
    <YStack style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          {orbs.map((orb, i) => (
            <RadialGradient key={i} id={`orb-${i}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor={orb.color} stopOpacity={1} />
              <Stop offset="70%" stopColor={orb.color} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={orb.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {orbs.map((orb, i) => (
          <DriftingOrb key={i} orb={orb} index={i} />
        ))}
      </Svg>
    </YStack>
  );
};

export type { AuraBackgroundProps, AuraVariant };
export { AuraBackground };
