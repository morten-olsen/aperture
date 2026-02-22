import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';
import { useMountAnimation } from '../../src/hooks/use-mount-animation';
import { GlassView } from '../../src/components/glass/glass-view';
import { TriggerDetail } from '../../src/components/trigger-detail/trigger-detail';
import { KeyboardAwareView } from '../../src/components/keyboard/keyboard-aware-view';

import type { TriggerDetailChanges } from '../../src/components/trigger-detail/trigger-detail';

const TriggerDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data } = useToolQuery('trigger.list', {});
  const updateTrigger = useToolInvoke('trigger.update');
  const deleteTrigger = useToolInvoke('trigger.delete');

  const trigger = data?.triggers.find((t) => t.id === id);

  const handleUpdate = useCallback(
    async (changes: TriggerDetailChanges) => {
      await updateTrigger.mutateAsync({ triggerId: id, ...changes });
      queryClient.invalidateQueries({ queryKey: ['tool', 'trigger.list'] });
    },
    [updateTrigger, id, queryClient],
  );

  const handleDelete = useCallback(async () => {
    await deleteTrigger.mutateAsync({ triggerId: id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'trigger.list'] });
    router.back();
  }, [deleteTrigger, id, queryClient, router]);

  const headerAnim = useMountAnimation({ translateY: -10, duration: 300, delay: 200 });
  const headerHeight = insets.top + 12 + 24 + 12;

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }, headerAnim.style]}>
        <GlassView intensity="strong" borderRadius={0} padding={0}>
          <XStack paddingHorizontal={16} paddingTop={insets.top + 12} paddingBottom={12} alignItems="center" gap={12}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ArrowLeft size={24} color="$accent" />
            </Pressable>
            {trigger && (
              <Text fontSize={17} fontWeight="600" color="$color" numberOfLines={1} flex={1}>
                {trigger.name}
              </Text>
            )}
          </XStack>
        </GlassView>
      </Animated.View>

      <YStack flex={1} paddingTop={headerHeight}>
        {trigger ? (
          <TriggerDetail
            trigger={trigger}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isUpdating={updateTrigger.isPending}
          />
        ) : (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Text color="$colorMuted">Loading...</Text>
          </YStack>
        )}
      </YStack>
    </KeyboardAwareView>
  );
};

export default TriggerDetailScreen;
