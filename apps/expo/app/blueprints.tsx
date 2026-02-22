import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { ArrowLeft, Plus } from '@tamagui/lucide-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../src/hooks/use-tools';
import { useMountAnimation } from '../src/hooks/use-mount-animation';
import { GlassView } from '../src/components/glass/glass-view';
import { BlueprintList } from '../src/components/blueprint-list/blueprint-list';
import { KeyboardAwareView } from '../src/components/keyboard/keyboard-aware-view';

const BlueprintsRoute = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, refetch, isLoading } = useToolQuery('blueprint.list', {});
  const createBlueprint = useToolInvoke('blueprint.create');

  const blueprints = data?.blueprints ?? [];

  const handleCreate = useCallback(async () => {
    const result = await createBlueprint.mutateAsync({
      title: 'New Blueprint',
      use_case: '',
      process: '',
    });
    queryClient.invalidateQueries({ queryKey: ['tool', 'blueprint.list'] });
    router.push(`/blueprint/${result.id}`);
  }, [createBlueprint, queryClient, router]);

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
            <Pressable onPress={handleCreate} disabled={createBlueprint.isPending}>
              <GlassView
                intensity="subtle"
                borderRadius={9999}
                padding={0}
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: createBlueprint.isPending ? 0.5 : 1,
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
          Blueprints
        </Text>
      </Animated.View>

      <BlueprintList
        blueprints={blueprints}
        onSelect={(id) => router.push(`/blueprint/${id}`)}
        onRefresh={refetch}
        isRefreshing={isLoading}
      />
    </KeyboardAwareView>
  );
};

export default BlueprintsRoute;
