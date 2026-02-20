import type { ReactNode } from 'react';
import Animated from 'react-native-reanimated';

import { useMountAnimation } from '../../hooks/use-mount-animation.ts';

type AnimatedListItemProps = {
  index: number;
  children: ReactNode;
};

const AnimatedListItem = ({ index, children }: AnimatedListItemProps) => {
  const { style } = useMountAnimation({
    translateY: 15,
    duration: 350,
    delay: 200 + Math.min(index * 50, 400),
  });

  return <Animated.View style={style}>{children}</Animated.View>;
};

export { AnimatedListItem };
