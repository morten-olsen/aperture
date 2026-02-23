import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, XStack, Text } from 'tamagui';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';

import { useToolQuery, useToolInvoke } from '../../../src/hooks/use-tools';
import { useMountAnimation } from '../../../src/hooks/use-mount-animation';
import { GlassView } from '../../../src/components/glass/glass-view';
import { SecretDetail } from '../../../src/components/secret-detail/secret-detail';
import { KeyboardAwareView } from '../../../src/components/keyboard/keyboard-aware-view';

import type { SecretDetailChanges } from '../../../src/components/secret-detail/secret-detail';

const SecretDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data } = useToolQuery('configuration.secrets.list', {});
  const updateSecret = useToolInvoke('configuration.secrets.update');
  const deleteSecret = useToolInvoke('configuration.secrets.delete');

  const secret = data?.secrets.find((s) => s.id === id);

  const handleUpdate = useCallback(
    async (changes: SecretDetailChanges) => {
      await updateSecret.mutateAsync({ id, ...changes });
      queryClient.invalidateQueries({ queryKey: ['tool', 'configuration.secrets.list'] });
    },
    [updateSecret, id, queryClient],
  );

  const handleDelete = useCallback(async () => {
    await deleteSecret.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'configuration.secrets.list'] });
    router.back();
  }, [deleteSecret, id, queryClient, router]);

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
            {secret && (
              <Text fontSize={17} fontWeight="600" color="$color" numberOfLines={1} flex={1}>
                {secret.name}
              </Text>
            )}
          </XStack>
        </GlassView>
      </Animated.View>

      <YStack flex={1} paddingTop={headerHeight}>
        {secret ? (
          <SecretDetail
            secret={secret}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isUpdating={updateSecret.isPending}
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

export default SecretDetailScreen;
