import { useEffect } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

const useKeyboardBottomInset = (): SharedValue<number> => {
  const insets = useSafeAreaInsets();
  const bottomInset = useSharedValue(insets.bottom);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const screenHeight = Dimensions.get('screen').height;
      bottomInset.value = withTiming(screenHeight - e.endCoordinates.screenY, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      bottomInset.value = withTiming(insets.bottom, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [bottomInset, insets.bottom]);

  return bottomInset;
};

export { useKeyboardBottomInset };
