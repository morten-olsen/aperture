import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { YStack, useThemeName } from 'tamagui';

type AuraVariant = 'default' | 'login' | 'chat';

type AuraBackgroundProps = {
  variant?: AuraVariant;
};

type OrbConfig = {
  color: string;
  cx: string;
  cy: string;
  r: string;
  opacity: number;
};

const getOrbs = (variant: AuraVariant, isDark: boolean): OrbConfig[] => {
  const alpha = isDark ? 0.35 : 0.3;

  switch (variant) {
    case 'login':
      return [
        { color: '#4F6DF5', cx: '20%', cy: '25%', r: '45%', opacity: alpha * 1.4 },
        { color: '#9B5DE5', cx: '80%', cy: '45%', r: '40%', opacity: alpha * 1.2 },
        { color: '#F15BB5', cx: '40%', cy: '80%', r: '35%', opacity: alpha },
      ];
    case 'chat':
      return [
        { color: '#4F6DF5', cx: '85%', cy: '8%', r: '40%', opacity: alpha * 0.8 },
        { color: '#9B5DE5', cx: '10%', cy: '85%', r: '38%', opacity: alpha * 0.7 },
      ];
    default:
      return [
        { color: '#4F6DF5', cx: '15%', cy: '15%', r: '42%', opacity: alpha },
        { color: '#9B5DE5', cx: '85%', cy: '50%', r: '38%', opacity: alpha * 0.9 },
        { color: '#F15BB5', cx: '45%', cy: '90%', r: '35%', opacity: alpha * 0.7 },
      ];
  }
};

const AuraBackground = ({ variant = 'default' }: AuraBackgroundProps) => {
  const themeName = useThemeName();
  const isDark = themeName === 'dark';
  const orbs = getOrbs(variant, isDark);

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
          <Circle key={i} cx={orb.cx} cy={orb.cy} r={orb.r} fill={`url(#orb-${i})`} opacity={orb.opacity} />
        ))}
      </Svg>
    </YStack>
  );
};

export type { AuraBackgroundProps, AuraVariant };
export { AuraBackground };
