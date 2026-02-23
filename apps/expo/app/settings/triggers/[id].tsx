import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { YStack, Text } from 'tamagui';
import { useQueryClient } from '@tanstack/react-query';

import { useToolQuery, useToolInvoke } from '../../../src/hooks/use-tools';
import { useAutoSave } from '../../../src/hooks/use-auto-save';
import { DetailHeader, useDetailHeaderHeight } from '../../../src/components/detail-header/detail-header';
import { TriggerDetail } from '../../../src/components/trigger-detail/trigger-detail';
import { KeyboardAwareView } from '../../../src/components/keyboard/keyboard-aware-view';

import type { TriggerDetailChanges } from '../../../src/components/trigger-detail/trigger-detail';

const TriggerDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const headerHeight = useDetailHeaderHeight();
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

  const { save, status: saveStatus } = useAutoSave(handleUpdate);

  const handleDelete = useCallback(async () => {
    await deleteTrigger.mutateAsync({ triggerId: id });
    queryClient.invalidateQueries({ queryKey: ['tool', 'trigger.list'] });
    router.back();
  }, [deleteTrigger, id, queryClient, router]);

  return (
    <KeyboardAwareView>
      <Stack.Screen options={{ headerShown: false }} />

      <DetailHeader title={trigger?.name} onBack={() => router.back()} saveStatus={saveStatus} />

      <YStack flex={1} paddingTop={headerHeight}>
        {trigger ? (
          <TriggerDetail trigger={trigger} onUpdate={save} onDelete={handleDelete} />
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
