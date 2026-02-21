import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';

import { AuraBackground } from '../aura/aura-background.tsx';
import { GlassView } from '../glass/glass-view.tsx';
import { KeyboardAwareView } from '../keyboard/keyboard-aware-view.tsx';

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

  return (
    <KeyboardAwareView style={{ paddingTop: insets.top }}>
      <AuraBackground />

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
        <GlassView intensity="strong" borderRadius={0} padding={0}>
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
        </GlassView>
      )}
      {children}
    </KeyboardAwareView>
  );
};

export type { PageProps };
export { Page };
