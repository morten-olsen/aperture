import type { ReactNode } from 'react';
import Animated from 'react-native-reanimated';

import { useMountAnimation } from '../../hooks/use-mount-animation.ts';

type AnimatedChatItemProps = {
  role?: string;
  kind: 'message' | 'tools';
  children: ReactNode;
};

const AnimatedChatItem = ({ role, kind, children }: AnimatedChatItemProps) => {
  const isUser = role === 'user';
  const isTools = kind === 'tools';

  const { style } = useMountAnimation({
    duration: isTools ? 250 : 300,
    translateX: isTools ? 0 : isUser ? 20 : -20,
    scale: isTools ? 0.95 : 1,
  });

  return <Animated.View style={style}>{children}</Animated.View>;
};

export { AnimatedChatItem };
