import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useKeyboardBottomInset } from '../../hooks/use-keyboard-bottom-inset.ts';

type KeyboardAwareViewProps = {
  children: ReactNode;
  style?: ViewStyle;
};

const KeyboardAwareView = ({ children, style }: KeyboardAwareViewProps) => {
  const bottomInset = useKeyboardBottomInset();

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    paddingBottom: bottomInset.value,
  }));

  const content = <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
};

export type { KeyboardAwareViewProps };
export { KeyboardAwareView };
