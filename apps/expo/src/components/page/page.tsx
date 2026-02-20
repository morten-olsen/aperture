import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';

type PageProps = {
  title: string;
  variant?: 'large' | 'inline';
  onBack?: () => void;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  children: ReactNode;
};

const Page = ({ title, variant = 'large', onBack, leftAction, rightAction, children }: PageProps) => {
  const insets = useSafeAreaInsets();

  const content = (
    <YStack flex={1} backgroundColor="$background" paddingTop={insets.top} paddingBottom={insets.bottom}>
      {variant === 'large' ? (
        <YStack paddingHorizontal="$5" paddingTop="$4" paddingBottom="$2" gap="$2">
          {(onBack || leftAction || rightAction) && (
            <XStack justifyContent="space-between" alignItems="center" height={28}>
              {onBack ? (
                <Pressable onPress={onBack} hitSlop={12}>
                  <XStack alignItems="center" gap="$1">
                    <Text fontSize={22} color="$accent" marginTop={-1}>
                      ‹
                    </Text>
                    <Text fontSize={17} color="$accent" fontWeight="400">
                      Back
                    </Text>
                  </XStack>
                </Pressable>
              ) : (
                (leftAction ?? <YStack />)
              )}
              {rightAction ?? <YStack />}
            </XStack>
          )}
          <Text fontFamily="$heading" fontSize={34} fontWeight="700" letterSpacing={-1} color="$color">
            {title}
          </Text>
        </YStack>
      ) : (
        <XStack paddingHorizontal="$5" paddingVertical="$3" alignItems="center" gap="$3">
          {onBack && (
            <Pressable onPress={onBack} hitSlop={12}>
              <Text fontSize={22} color="$accent" marginTop={-1}>
                ‹
              </Text>
            </Pressable>
          )}
          <Text fontFamily="$heading" fontSize={17} fontWeight="600" letterSpacing={-0.2} flex={1} color="$color">
            {title}
          </Text>
          {rightAction}
        </XStack>
      )}
      {children}
    </YStack>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
};

export type { PageProps };
export { Page };
