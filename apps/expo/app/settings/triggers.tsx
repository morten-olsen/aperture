import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { ArrowLeft, Plus } from '@tamagui/lucide-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../../src/hooks/use-tools';
import { useMountAnimation } from '../../src/hooks/use-mount-animation';
import { GlassView } from '../../src/components/glass/glass-view';
import { TriggerList } from '../../src/components/trigger-list/trigger-list';
import { KeyboardAwareView } from '../../src/components/keyboard/keyboard-aware-view';

const TriggersRoute = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('trigger.list', {});
  const createTrigger = useToolInvoke('trigger.create');

  const triggers = data?.triggers ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createTrigger.mutateAsync({
      name: 'New Trigger',
      goal: '',
      model: 'normal',
      scheduleType: 'cron',
      scheduleValue: '0 9 * * *',
    });
    queryClient.invalidateQueries({ queryKey: ['tool', 'trigger.list'] });
    router.push(`/settings/triggers/${result.triggerId}`);
  }, [createTrigger, queryClient, router]);

  const headerAnim = useMountAnimation({ duration: 400, delay: 200 });
  const titleAnim = useMountAnimation({ translateY: 10, duration: 450, delay: 300 });

  return (
    <KeyboardAwareView style={{ paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={headerAnim.style}>
        <YStack paddingHorizontal="$5" paddingTop="$4" paddingBottom="$2">
          <XStack alignItems="center" height={52}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <GlassView
                intensity="subtle"
                borderRadius={9999}
                padding={0}
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowLeft size={24} color="$accent" />
              </GlassView>
            </Pressable>
            <YStack flex={1} />
            <Pressable onPress={handleCreate} disabled={createTrigger.isPending}>
              <GlassView
                intensity="subtle"
                borderRadius={9999}
                padding={0}
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: createTrigger.isPending ? 0.5 : 1,
                }}
              >
                <Plus size={24} color="$accent" />
              </GlassView>
            </Pressable>
          </XStack>
        </YStack>
      </Animated.View>

      <Animated.View style={titleAnim.style}>
        <Text
          fontFamily="$heading"
          fontSize={34}
          fontWeight="700"
          letterSpacing={-1}
          color="$color"
          paddingHorizontal="$5"
          paddingTop="$4"
          paddingBottom="$3"
        >
          Triggers
        </Text>
      </Animated.View>

      <TriggerList
        triggers={triggers}
        onSelect={(id) => router.push(`/settings/triggers/${id}`)}
        onRefresh={refetch}
        isRefreshing={isLoading}
      />
    </KeyboardAwareView>
  );
};

export default TriggersRoute;
