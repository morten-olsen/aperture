import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, Text, Spinner } from 'tamagui';
import { ArrowLeft, Check, AlertCircle } from '@tamagui/lucide-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useMountAnimation } from '../../hooks/use-mount-animation.ts';
import { GlassView } from '../glass/glass-view.tsx';

import type { AutoSaveStatus } from '../../hooks/use-auto-save.ts';

type DetailHeaderProps = {
  title: string | undefined;
  onBack: () => void;
  saveStatus: AutoSaveStatus;
};

const SaveIndicator = ({ status }: { status: AutoSaveStatus }) => {
  if (status === 'saving') {
    return (
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
        <XStack alignItems="center" gap={6}>
          <Spinner size="small" color="$colorMuted" />
          <Text fontSize={13} color="$colorMuted">
            Saving...
          </Text>
        </XStack>
      </Animated.View>
    );
  }

  if (status === 'saved') {
    return (
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
        <XStack alignItems="center" gap={4}>
          <Check size={14} color="$success" />
          <Text fontSize={13} color="$success">
            Saved
          </Text>
        </XStack>
      </Animated.View>
    );
  }

  if (status === 'error') {
    return (
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
        <XStack alignItems="center" gap={4}>
          <AlertCircle size={14} color="$danger" />
          <Text fontSize={13} color="$danger">
            Failed
          </Text>
        </XStack>
      </Animated.View>
    );
  }

  return null;
};

const DetailHeader = ({ title, onBack, saveStatus }: DetailHeaderProps) => {
  const insets = useSafeAreaInsets();
  const headerAnim = useMountAnimation({ translateY: -10, duration: 300, delay: 200 });

  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnim.style]}>
      <GlassView intensity="strong" borderRadius={0} padding={0}>
        <XStack paddingHorizontal={16} paddingTop={insets.top + 12} paddingBottom={12} alignItems="center" gap={12}>
          <Pressable onPress={onBack} hitSlop={12}>
            <ArrowLeft size={24} color="$accent" />
          </Pressable>
          {title !== undefined && (
            <Text fontSize={17} fontWeight="600" color="$color" numberOfLines={1} flex={1}>
              {title}
            </Text>
          )}
          <SaveIndicator status={saveStatus} />
        </XStack>
      </GlassView>
    </Animated.View>
  );
};

const useDetailHeaderHeight = () => {
  const insets = useSafeAreaInsets();
  return insets.top + 12 + 24 + 12;
};

export type { DetailHeaderProps };
export { DetailHeader, useDetailHeaderHeight };
